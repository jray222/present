"""add token_version to users

Revision ID: 0005_add_user_token_version
Revises: 0004_add_gift_preferences
Create Date: 2026-11-19 20:36:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005_add_user_token_version'
down_revision: Union[str, Sequence[str], None] = '0004_add_gift_preferences'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    user_cols = [c["name"] for c in inspector.get_columns("users")]
    if "token_version" not in user_cols:
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("token_version", sa.Integer(), server_default="0", nullable=False)
            )


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("token_version")
