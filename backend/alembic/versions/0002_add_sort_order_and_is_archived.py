"""add sort_order and is_archived

Revision ID: 0002_add_sort_order_and_is_archived
Revises: 0001_baseline
Create Date: 2026-11-05 06:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_add_sort_order_and_is_archived'
down_revision: Union[str, Sequence[str], None] = '0001_baseline'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    existing_item_cols = [c["name"] for c in inspector.get_columns("wishlist_items")]
    if "sort_order" not in existing_item_cols:
        with op.batch_alter_table("wishlist_items", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0"))
            )

    existing_wishlist_cols = [c["name"] for c in inspector.get_columns("wishlists")]
    if "is_archived" not in existing_wishlist_cols:
        with op.batch_alter_table("wishlists", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("0"))
            )


def downgrade() -> None:
    with op.batch_alter_table("wishlists", schema=None) as batch_op:
        batch_op.drop_column("is_archived")

    with op.batch_alter_table("wishlist_items", schema=None) as batch_op:
        batch_op.drop_column("sort_order")
