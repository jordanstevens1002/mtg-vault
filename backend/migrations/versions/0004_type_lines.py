"""Keep catalogue filter options inexpensive to read after bulk import."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cards", sa.Column("type_line", sa.String(), nullable=False, server_default="")
    )
    op.execute("UPDATE cards SET type_line = COALESCE(data->>'type_line', '')")
    op.create_index("ix_cards_type_line", "cards", ["type_line"])
    op.execute("ANALYZE cards")


def downgrade() -> None:
    op.drop_index("ix_cards_type_line", table_name="cards")
    op.drop_column("cards", "type_line")
