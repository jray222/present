"""add secret santa exclusions_json

Revision ID: 0003_add_secret_santa_exclusions
Revises: 0002_add_sort_order_and_is_archived
Create Date: 2026-11-07 15:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003_add_secret_santa_exclusions'
down_revision: Union[str, Sequence[str], None] = '0002_add_sort_order_and_is_archived'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    existing_cols = [c["name"] for c in inspector.get_columns("secret_santa_draws")]
    if "exclusions_json" not in existing_cols:
        with op.batch_alter_table("secret_santa_draws", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("exclusions_json", sa.Text(), nullable=True)
            )


def downgrade() -> None:
    with op.batch_alter_table("secret_santa_draws", schema=None) as batch_op:
        batch_op.drop_column("exclusions_json")
