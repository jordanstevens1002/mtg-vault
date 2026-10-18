"""Index canonical and translated names without scanning provider JSON."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.add_column(
        "printings",
        sa.Column("search_names", sa.String(), nullable=False, server_default=""),
    )
    op.execute(
        """UPDATE printings SET search_names = concat_ws(E'\n',
        data->>'name', data->>'printed_name',
        (SELECT string_agg(concat_ws(E'\n', face->>'name', face->>'printed_name'), E'\n')
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'card_faces')='array'
              THEN data->'card_faces' ELSE '[]'::jsonb END) AS face))"""
    )
    for table, column in (("cards", "name"), ("printings", "search_names")):
        op.create_index(
            f"ix_{table}_{column}_trgm",
            table,
            [column],
            postgresql_using="gin",
            postgresql_ops={column: "gin_trgm_ops"},
        )
        op.execute(f"ANALYZE {table}")


def downgrade() -> None:
    op.drop_index("ix_printings_search_names_trgm", table_name="printings")
    op.drop_index("ix_cards_name_trgm", table_name="cards")
    op.drop_column("printings", "search_names")
