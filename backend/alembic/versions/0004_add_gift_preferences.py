"""add gift_preferences_json to users and managed_profiles

Revision ID: 0004_add_gift_preferences
Revises: 0003_add_secret_santa_exclusions
Create Date: 2026-11-19 20:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004_add_gift_preferences'
down_revision: Union[str, Sequence[str], None] = '0003_add_secret_santa_exclusions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    user_cols = [c["name"] for c in inspector.get_columns("users")]
    if "gift_preferences_json" not in user_cols:
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("gift_preferences_json", sa.Text(), nullable=True)
            )

    profile_cols = [c["name"] for c in inspector.get_columns("managed_profiles")]
    if "gift_preferences_json" not in profile_cols:
        with op.batch_alter_table("managed_profiles", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("gift_preferences_json", sa.Text(), nullable=True)
            )


def downgrade() -> None:
    with op.batch_alter_table("managed_profiles", schema=None) as batch_op:
        batch_op.drop_column("gift_preferences_json")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("gift_preferences_json")
