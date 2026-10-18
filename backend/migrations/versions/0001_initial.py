"""Initial collection, catalogue and physical placement schema."""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE cards (\n\tid UUID NOT NULL, \n\tname VARCHAR NOT NULL, \n\tdata JSONB NOT NULL, \n\tPRIMARY KEY (id)\n)"
    )
    op.execute("CREATE INDEX ix_cards_name ON cards (name)")
    op.execute(
        "CREATE TABLE collections (\n\tid UUID NOT NULL, \n\tname VARCHAR(160) NOT NULL, \n\tPRIMARY KEY (id)\n)"
    )
    op.execute(
        "CREATE TABLE sync_state (\n\tid INTEGER NOT NULL, \n\tlast_success TIMESTAMP WITH TIME ZONE, \n\tlast_attempt TIMESTAMP WITH TIME ZONE, \n\terror VARCHAR, \n\trunning BOOLEAN NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id)\n)"
    )
    op.execute(
        "CREATE TABLE decks (\n\tid UUID NOT NULL, \n\tcollection_id UUID NOT NULL, \n\tname VARCHAR(160) NOT NULL, \n\tstate VARCHAR NOT NULL, \n\tformat VARCHAR NOT NULL, \n\tPRIMARY KEY (id), \n\tCHECK (state IN ('planned','built')), \n\tCHECK (format IN ('commander','casual')), \n\tFOREIGN KEY(collection_id) REFERENCES collections (id)\n)"
    )
    op.execute("CREATE INDEX ix_decks_collection_id ON decks (collection_id)")
    op.execute(
        "CREATE TABLE locations (\n\tid UUID NOT NULL, \n\tcollection_id UUID NOT NULL, \n\tname VARCHAR(160) NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (collection_id, name), \n\tFOREIGN KEY(collection_id) REFERENCES collections (id)\n)"
    )
    op.execute("CREATE INDEX ix_locations_collection_id ON locations (collection_id)")
    op.execute(
        "CREATE TABLE operations (\n\tcollection_id UUID NOT NULL, \n\tkey UUID NOT NULL, \n\tpayload_hash VARCHAR NOT NULL, \n\tresult JSONB NOT NULL, \n\tPRIMARY KEY (collection_id, key), \n\tFOREIGN KEY(collection_id) REFERENCES collections (id)\n)"
    )
    op.execute(
        "CREATE TABLE printings (\n\tid UUID NOT NULL, \n\tcard_id UUID NOT NULL, \n\tdata JSONB NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(card_id) REFERENCES cards (id)\n)"
    )
    op.execute("CREATE INDEX ix_printings_card_id ON printings (card_id)")
    op.execute(
        "CREATE TABLE balances (\n\tid UUID NOT NULL, \n\tcollection_id UUID NOT NULL, \n\tprinting_id UUID NOT NULL, \n\tfinish VARCHAR NOT NULL, \n\tplacement VARCHAR NOT NULL, \n\tlocation_id UUID, \n\tdeck_id UUID, \n\tsection VARCHAR NOT NULL, \n\tquantity INTEGER NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (collection_id, printing_id, finish, placement), \n\tCHECK (quantity >= 0), \n\tCHECK (finish IN ('nonfoil','foil','etched','glossy')), \n\tCHECK (section IN ('mainboard','sideboard','commander')), \n\tCHECK ((location_id IS NULL) <> (deck_id IS NULL)), \n\tFOREIGN KEY(collection_id) REFERENCES collections (id), \n\tFOREIGN KEY(printing_id) REFERENCES printings (id), \n\tFOREIGN KEY(location_id) REFERENCES locations (id), \n\tFOREIGN KEY(deck_id) REFERENCES decks (id)\n)"
    )
    op.execute("CREATE INDEX ix_balances_collection_id ON balances (collection_id)")
    op.execute("CREATE INDEX ix_balances_printing_id ON balances (printing_id)")
    op.execute(
        "CREATE TABLE covers (\n\tcollection_id UUID NOT NULL, \n\tcard_id UUID NOT NULL, \n\tprinting_id UUID NOT NULL, \n\tPRIMARY KEY (collection_id, card_id), \n\tFOREIGN KEY(collection_id) REFERENCES collections (id), \n\tFOREIGN KEY(card_id) REFERENCES cards (id), \n\tFOREIGN KEY(printing_id) REFERENCES printings (id)\n)"
    )
    op.execute(
        "CREATE TABLE deck_entries (\n\tid UUID NOT NULL, \n\tdeck_id UUID NOT NULL, \n\tcard_id UUID NOT NULL, \n\tpreferred_printing_id UUID, \n\tsection VARCHAR NOT NULL, \n\tquantity INTEGER NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (deck_id, card_id, section), \n\tCHECK (quantity > 0), \n\tCHECK (section IN ('mainboard','sideboard','commander')), \n\tFOREIGN KEY(deck_id) REFERENCES decks (id), \n\tFOREIGN KEY(card_id) REFERENCES cards (id), \n\tFOREIGN KEY(preferred_printing_id) REFERENCES printings (id)\n)"
    )
    op.execute("CREATE INDEX ix_deck_entries_deck_id ON deck_entries (deck_id)")
    op.execute(
        "INSERT INTO collections (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'My collection')"
    )
    op.execute(
        "INSERT INTO locations (id, collection_id, name) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Unsorted')"
    )


def downgrade() -> None:
    op.drop_table("deck_entries")
    op.drop_table("covers")
    op.drop_table("balances")
    op.drop_table("printings")
    op.drop_table("operations")
    op.drop_table("locations")
    op.drop_table("decks")
    op.drop_table("sync_state")
    op.drop_table("collections")
    op.drop_table("cards")
