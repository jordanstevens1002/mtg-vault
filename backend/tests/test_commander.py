from typing import Any

from vault.commander import copy_limit, eligible, pairs, validate


def card(
    name: str = "Leader",
    types: str = "Legendary Creature — Human",
    oracle: str = "",
    colours: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "type_line": types,
        "oracle_text": oracle,
        "color_identity": ["W"] if colours is None else colours,
        "legalities": {"commander": "legal"},
    }


def test_ordinary_deck_and_basic_land_colour() -> None:
    entries = [
        {"section": "commander", "quantity": 1, "data": card()},
        {
            "section": "mainboard",
            "quantity": 99,
            "data": card("Plains", "Basic Land — Plains", colours=[]),
        },
    ]
    assert validate(entries) == []
    entries[1]["data"]["type_line"] = "Basic Land — Island"
    assert "color_identity" in {f["code"] for f in validate(entries)}


def test_copy_exceptions_and_banned_card() -> None:
    assert (
        copy_limit(
            card(
                "Seven Dwarves",
                oracle="A deck can have up to seven cards named Seven Dwarves.",
            )
        )
        == 7
    )
    assert (
        copy_limit(
            card("Rats", oracle="A deck can have any number of cards named Rats.")
        )
        is None
    )
    data = card()
    data["legalities"]["commander"] = "banned"
    codes = {
        f["code"]
        for f in validate([{"section": "mainboard", "quantity": 2, "data": data}])
    }
    assert {"deck_size", "commander", "copy_limit", "card_legality"} <= codes


def test_partner_variants_and_named_partners() -> None:
    assert pairs(card(oracle="Partner (Reminder)"), card(oracle="Partner"))
    assert not pairs(card(oracle="Partner"), card(oracle="Friends forever"))
    assert pairs(
        card(oracle="Partner—Friends forever"),
        card(oracle="Partner—Friends forever (Reminder)"),
    )
    assert not pairs(
        card(oracle="Partner—Friends forever"), card(oracle="Partner—Survivors")
    )
    assert pairs(
        card("Alpha", oracle="Partner with Beta (Reminder)"),
        card("Beta", oracle="Partner with Alpha"),
    )
    assert not pairs(
        card("Alpha", oracle="Partner with Beta"),
        card("Gamma", oracle="Partner with Alpha"),
    )


def test_background_and_doctor_pairings() -> None:
    assert pairs(
        card(oracle="Choose a Background"),
        card("Story", "Legendary Enchantment — Background"),
    )
    assert not eligible(card("Story", "Legendary Enchantment — Background"))
    assert pairs(
        card(oracle="Doctor's companion"),
        card("Doctor", "Legendary Creature — Time Lord Doctor"),
    )
    assert not pairs(
        card(oracle="Doctor's companion"),
        card("Doctor", "Legendary Creature — Human Time Lord Doctor"),
    )


def test_vehicle_and_front_face_eligibility() -> None:
    vehicle = card("Ship", "Legendary Artifact — Vehicle")
    vehicle.update(power="4", toughness="4")
    assert eligible(vehicle)
    assert eligible(
        card("Walker", "Legendary Planeswalker", "Walker can be your commander.")
    )
    assert not eligible({"card_faces": [card("Front", "Sorcery"), card("Back")]})


def test_chosen_colour_is_persisted_and_validated(
    client: Any, db: Any, plains: Any
) -> None:
    from uuid import uuid4

    from vault.models import Card

    piper = Card(
        id=uuid4(),
        name="The Prismatic Piper",
        data=card(
            "The Prismatic Piper",
            oracle="If The Prismatic Piper is your commander, choose a color before the game begins.",
            colours=[],
        ),
    )
    db.add(piper)
    db.commit()
    deck_id = client.post("/api/v1/decks", json={"name": "Chosen colour"}).json()["id"]
    entries = [
        {"card_id": str(piper.id), "section": "commander", "quantity": 1},
        {"card_id": str(plains[0].id), "quantity": 99},
    ]
    assert (
        client.put(
            f"/api/v1/decks/{deck_id}/entries", json={"entries": entries}
        ).status_code
        == 200
    )
    missing = client.get(f"/api/v1/decks/{deck_id}/validation").json()
    assert {f["code"] for f in missing["findings"]} == {"commander_color_choice"}
    url = f"/api/v1/decks/{deck_id}/commander-colours"
    assert client.put(url, json={"choices": {str(piper.id): "W"}}).status_code == 200
    assert client.get(f"/api/v1/decks/{deck_id}/validation").json()["findings"] == []
    assert client.get(f"/api/v1/decks/{deck_id}").json()["commander_colors"] == {
        str(piper.id): "W"
    }
    assert client.put(url, json={"choices": {str(piper.id): "G"}}).status_code == 200
    assert {
        f["code"]
        for f in client.get(f"/api/v1/decks/{deck_id}/validation").json()["findings"]
    } == {"color_identity"}
    assert (
        client.put(url, json={"choices": {str(plains[0].id): "W"}}).status_code == 422
    )
    assert client.put(url, json={"choices": {str(piper.id): "X"}}).status_code == 422
    assert client.get("/api/v1/summary").json()["owned"] == 0
