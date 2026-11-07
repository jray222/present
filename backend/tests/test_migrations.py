import pytest
from pathlib import Path
from sqlalchemy import create_engine, inspect, text
from alembic.config import Config
from alembic import command
from app.main import run_migrations

def test_startup_fresh_database(tmp_path):
    """Test starting the application against an empty/fresh database."""
    db_file = tmp_path / "fresh.db"
    db_url = f"sqlite:///{db_file}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    # Verify database is fresh
    inspector = inspect(engine)
    assert len(inspector.get_table_names()) == 0

    # Run startup migrations
    run_migrations(target_engine=engine)

    # Inspect schema after migration
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    # Core tables exist
    assert "users" in tables
    assert "wishlists" in tables
    assert "wishlist_items" in tables
    assert "family_groups" in tables
    assert "item_claims" in tables
    assert "alembic_version" in tables

    # New columns exist
    wishlist_cols = [c["name"] for c in inspector.get_columns("wishlists")]
    assert "is_archived" in wishlist_cols

    item_cols = [c["name"] for c in inspector.get_columns("wishlist_items")]
    assert "sort_order" in item_cols

    santa_cols = [c["name"] for c in inspector.get_columns("secret_santa_draws")]
    assert "exclusions_json" in santa_cols

    # Alembic version is at head
    with engine.connect() as conn:
        rev = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert rev == "0003_add_secret_santa_exclusions"

    # Subsequent restart is idempotent
    run_migrations(target_engine=engine)
    with engine.connect() as conn:
        rev_after = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert rev_after == "0003_add_secret_santa_exclusions"

def test_startup_older_database(tmp_path):
    """
    Test starting the application against an older database that has tables
    from the original schema but no alembic_version table.
    """
    db_file = tmp_path / "older.db"
    db_url = f"sqlite:///{db_file}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    alembic_ini_path = Path(__file__).resolve().parent.parent / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)

    # 1. Apply baseline migration
    command.upgrade(alembic_cfg, "0001_baseline")

    # 2. Simulate older database created before Alembic: drop alembic_version
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE alembic_version"))
        # Insert sample legacy data
        conn.execute(text(
            "INSERT INTO users (username, password_hash, avatar_color, is_active, is_superuser, totp_enabled) "
            "VALUES ('legacy_user', 'hash123', 'emerald', 1, 0, 0)"
        ))
        user_id = conn.execute(text("SELECT id FROM users WHERE username='legacy_user'")).scalar()
        conn.execute(text(
            f"INSERT INTO wishlists (user_id, title, occasion, icon, view_mode, is_public) "
            f"VALUES ({user_id}, 'Legacy Wishlist', 'Birthday', '🎁', 'grid', 0)"
        ))
        wl_id = conn.execute(text(f"SELECT id FROM wishlists WHERE user_id={user_id}")).scalar()
        conn.execute(text(
            f"INSERT INTO wishlist_items (wishlist_id, title, currency, priority, desired_quantity) "
            f"VALUES ({wl_id}, 'Legacy Gift', 'USD', 2, 1)"
        ))
        conn.commit()

    # Verify older database state: has tables, but no alembic_version, and missing new columns
    inspector_before = inspect(engine)
    assert "alembic_version" not in inspector_before.get_table_names()
    assert "is_archived" not in [c["name"] for c in inspector_before.get_columns("wishlists")]
    assert "sort_order" not in [c["name"] for c in inspector_before.get_columns("wishlist_items")]

    # 3. Run application startup migration logic
    run_migrations(target_engine=engine)

    # 4. Verify post-upgrade state
    inspector_after = inspect(engine)
    assert "alembic_version" in inspector_after.get_table_names()

    wishlist_cols = [c["name"] for c in inspector_after.get_columns("wishlists")]
    assert "is_archived" in wishlist_cols

    item_cols = [c["name"] for c in inspector_after.get_columns("wishlist_items")]
    assert "sort_order" in item_cols

    santa_cols = [c["name"] for c in inspector_after.get_columns("secret_santa_draws")]
    assert "exclusions_json" in santa_cols

    with engine.connect() as conn:
        rev = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert rev == "0003_add_secret_santa_exclusions"

        # Verify existing data is preserved and can be queried with new columns
        row = conn.execute(text(
            "SELECT w.title, w.is_archived, i.title, i.sort_order "
            "FROM wishlists w JOIN wishlist_items i ON i.wishlist_id = w.id"
        )).fetchone()
        assert row is not None
        assert row[0] == "Legacy Wishlist"
        assert row[1] == 0  # default False
        assert row[2] == "Legacy Gift"
        assert row[3] == 0  # default 0

    # 5. Subsequent restart is idempotent
    run_migrations(target_engine=engine)

def test_migration_failure_fails_loudly(tmp_path):
    """Test that a failure in migrations raises an exception and does not fail silently."""
    # Pass an invalid config path that doesn't exist
    invalid_ini = tmp_path / "nonexistent_alembic.ini"
    db_file = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_file}")

    with pytest.raises(Exception):
        run_migrations(target_engine=engine, ini_path=invalid_ini)
