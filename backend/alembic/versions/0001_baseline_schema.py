"""baseline_schema

Revision ID: 0001_baseline
Revises: 
Create Date: 2026-11-05 06:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_baseline'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. System Settings
    op.create_table(
        'system_settings',
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('key')
    )

    # 2. Users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=64), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('full_name', sa.String(length=128), nullable=True),
        sa.Column('avatar_color', sa.String(length=32), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('password_changed_at', sa.DateTime(), nullable=True),
        sa.Column('google_sub', sa.String(length=255), nullable=True),
        sa.Column('avatar_url', sa.String(length=512), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('is_superuser', sa.Boolean(), nullable=False),
        sa.Column('totp_secret_encrypted', sa.String(length=255), nullable=True),
        sa.Column('totp_enabled', sa.Boolean(), nullable=False),
        sa.Column('totp_confirmed_at', sa.DateTime(), nullable=True),
        sa.Column('totp_last_used_step', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_google_sub'), 'users', ['google_sub'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # 3. Backup Codes
    op.create_table(
        'backup_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('code_hash', sa.String(length=255), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_backup_codes_id'), 'backup_codes', ['id'], unique=False)
    op.create_index(op.f('ix_backup_codes_user_id'), 'backup_codes', ['user_id'], unique=False)

    # 4. Family Groups
    op.create_table(
        'family_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('invite_code', sa.String(length=32), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_family_groups_id'), 'family_groups', ['id'], unique=False)
    op.create_index(op.f('ix_family_groups_invite_code'), 'family_groups', ['invite_code'], unique=True)

    # 5. Managed Profiles
    op.create_table(
        'managed_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('manager_user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('avatar_emoji', sa.String(length=16), nullable=False),
        sa.Column('notes', sa.String(length=255), nullable=True),
        sa.Column('birth_date', sa.String(length=32), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['manager_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_managed_profiles_id'), 'managed_profiles', ['id'], unique=False)
    op.create_index(op.f('ix_managed_profiles_manager_user_id'), 'managed_profiles', ['manager_user_id'], unique=False)

    # 6. Passkey Credentials
    op.create_table(
        'passkey_credentials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('credential_id', sa.String(length=255), nullable=False),
        sa.Column('public_key', sa.LargeBinary(), nullable=False),
        sa.Column('sign_count', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('transports', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_passkey_credentials_credential_id'), 'passkey_credentials', ['credential_id'], unique=True)
    op.create_index(op.f('ix_passkey_credentials_id'), 'passkey_credentials', ['id'], unique=False)
    op.create_index(op.f('ix_passkey_credentials_user_id'), 'passkey_credentials', ['user_id'], unique=False)

    # 7. Refresh Tokens
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked', sa.Boolean(), nullable=False),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('ip_address', sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_refresh_tokens_id'), 'refresh_tokens', ['id'], unique=False)
    op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=True)
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)

    # 8. Group Members
    op.create_table(
        'group_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False),
        sa.Column('joined_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['group_id'], ['family_groups.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('group_id', 'user_id', name='uq_group_user')
    )
    op.create_index(op.f('ix_group_members_group_id'), 'group_members', ['group_id'], unique=False)
    op.create_index(op.f('ix_group_members_id'), 'group_members', ['id'], unique=False)
    op.create_index(op.f('ix_group_members_user_id'), 'group_members', ['user_id'], unique=False)

    # 9. Secret Santa Draws
    op.create_table(
        'secret_santa_draws',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=128), nullable=False),
        sa.Column('budget_limit', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('exchange_date', sa.String(length=32), nullable=True),
        sa.Column('rules_notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['group_id'], ['family_groups.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_secret_santa_draws_group_id'), 'secret_santa_draws', ['group_id'], unique=False)
    op.create_index(op.f('ix_secret_santa_draws_id'), 'secret_santa_draws', ['id'], unique=False)

    # 10. Wishlists (Baseline without is_archived)
    op.create_table(
        'wishlists',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('managed_profile_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(length=128), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('occasion', sa.String(length=64), nullable=False),
        sa.Column('icon', sa.String(length=16), nullable=False),
        sa.Column('view_mode', sa.String(length=16), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['managed_profile_id'], ['managed_profiles.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_wishlists_id'), 'wishlists', ['id'], unique=False)
    op.create_index(op.f('ix_wishlists_managed_profile_id'), 'wishlists', ['managed_profile_id'], unique=False)
    op.create_index(op.f('ix_wishlists_user_id'), 'wishlists', ['user_id'], unique=False)

    # 11. Secret Santa Pairs
    op.create_table(
        'secret_santa_pairs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('draw_id', sa.Integer(), nullable=False),
        sa.Column('giver_name', sa.String(length=128), nullable=False),
        sa.Column('giver_user_id', sa.Integer(), nullable=True),
        sa.Column('receiver_name', sa.String(length=128), nullable=False),
        sa.Column('receiver_user_id', sa.Integer(), nullable=True),
        sa.Column('view_token', sa.String(length=64), nullable=False),
        sa.Column('viewed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['draw_id'], ['secret_santa_draws.id'], ),
        sa.ForeignKeyConstraint(['giver_user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['receiver_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_secret_santa_pairs_draw_id'), 'secret_santa_pairs', ['draw_id'], unique=False)
    op.create_index(op.f('ix_secret_santa_pairs_id'), 'secret_santa_pairs', ['id'], unique=False)
    op.create_index(op.f('ix_secret_santa_pairs_view_token'), 'secret_santa_pairs', ['view_token'], unique=True)

    # 12. Wishlist Items (Baseline without sort_order)
    op.create_table(
        'wishlist_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('wishlist_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('image_url', sa.Text(), nullable=True),
        sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('currency', sa.String(length=8), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False),
        sa.Column('desired_quantity', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['wishlist_id'], ['wishlists.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_wishlist_items_id'), 'wishlist_items', ['id'], unique=False)
    op.create_index(op.f('ix_wishlist_items_wishlist_id'), 'wishlist_items', ['wishlist_id'], unique=False)

    # 13. Wishlist Share Tokens
    op.create_table(
        'wishlist_share_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('wishlist_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('label', sa.String(length=128), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['wishlist_id'], ['wishlists.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_wishlist_share_tokens_id'), 'wishlist_share_tokens', ['id'], unique=False)
    op.create_index(op.f('ix_wishlist_share_tokens_token'), 'wishlist_share_tokens', ['token'], unique=True)
    op.create_index(op.f('ix_wishlist_share_tokens_wishlist_id'), 'wishlist_share_tokens', ['wishlist_id'], unique=False)

    # 14. Item Claims
    op.create_table(
        'item_claims',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('claimed_by_user_id', sa.Integer(), nullable=True),
        sa.Column('guest_buyer_name', sa.String(length=128), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.Column('reserved_at', sa.DateTime(), nullable=True),
        sa.Column('purchased_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['claimed_by_user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['item_id'], ['wishlist_items.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_item_claims_claimed_by_user_id'), 'item_claims', ['claimed_by_user_id'], unique=False)
    op.create_index(op.f('ix_item_claims_id'), 'item_claims', ['id'], unique=False)
    op.create_index(op.f('ix_item_claims_item_id'), 'item_claims', ['item_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_item_claims_item_id'), table_name='item_claims')
    op.drop_index(op.f('ix_item_claims_id'), table_name='item_claims')
    op.drop_index(op.f('ix_item_claims_claimed_by_user_id'), table_name='item_claims')
    op.drop_table('item_claims')
    op.drop_index(op.f('ix_wishlist_share_tokens_wishlist_id'), table_name='wishlist_share_tokens')
    op.drop_index(op.f('ix_wishlist_share_tokens_token'), table_name='wishlist_share_tokens')
    op.drop_index(op.f('ix_wishlist_share_tokens_id'), table_name='wishlist_share_tokens')
    op.drop_table('wishlist_share_tokens')
    op.drop_index(op.f('ix_wishlist_items_wishlist_id'), table_name='wishlist_items')
    op.drop_index(op.f('ix_wishlist_items_id'), table_name='wishlist_items')
    op.drop_table('wishlist_items')
    op.drop_index(op.f('ix_secret_santa_pairs_view_token'), table_name='secret_santa_pairs')
    op.drop_index(op.f('ix_secret_santa_pairs_id'), table_name='secret_santa_pairs')
    op.drop_index(op.f('ix_secret_santa_pairs_draw_id'), table_name='secret_santa_pairs')
    op.drop_table('secret_santa_pairs')
    op.drop_index(op.f('ix_wishlists_user_id'), table_name='wishlists')
    op.drop_index(op.f('ix_wishlists_managed_profile_id'), table_name='wishlists')
    op.drop_index(op.f('ix_wishlists_id'), table_name='wishlists')
    op.drop_table('wishlists')
    op.drop_index(op.f('ix_secret_santa_draws_id'), table_name='secret_santa_draws')
    op.drop_index(op.f('ix_secret_santa_draws_group_id'), table_name='secret_santa_draws')
    op.drop_table('secret_santa_draws')
    op.drop_index(op.f('ix_group_members_user_id'), table_name='group_members')
    op.drop_index(op.f('ix_group_members_id'), table_name='group_members')
    op.drop_index(op.f('ix_group_members_group_id'), table_name='group_members')
    op.drop_table('group_members')
    op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_token_hash'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_id'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
    op.drop_index(op.f('ix_passkey_credentials_user_id'), table_name='passkey_credentials')
    op.drop_index(op.f('ix_passkey_credentials_id'), table_name='passkey_credentials')
    op.drop_index(op.f('ix_passkey_credentials_credential_id'), table_name='passkey_credentials')
    op.drop_table('passkey_credentials')
    op.drop_index(op.f('ix_managed_profiles_manager_user_id'), table_name='managed_profiles')
    op.drop_index(op.f('ix_managed_profiles_id'), table_name='managed_profiles')
    op.drop_table('managed_profiles')
    op.drop_index(op.f('ix_family_groups_invite_code'), table_name='family_groups')
    op.drop_index(op.f('ix_family_groups_id'), table_name='family_groups')
    op.drop_table('family_groups')
    op.drop_index(op.f('ix_backup_codes_user_id'), table_name='backup_codes')
    op.drop_index(op.f('ix_backup_codes_id'), table_name='backup_codes')
    op.drop_table('backup_codes')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_google_sub'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_table('system_settings')
