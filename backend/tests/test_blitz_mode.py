"""Blitz rules come out of the game code: the act layout, the opening pick,
the merchant's odds, the room rewards and what the mode bans."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

import blitz_mode  # noqa: E402

RUN_MODEL = """
	public static async Task GiveNeowRewards(Player player)
	{
		List<CardCreationResult> options = (from r in CardFactory.CreateForReward(player, 10, options2)
		IEnumerable<CardModel> selectedCards = await CardSelectCmd.FromSimpleGridForRewards(prefs: new CardSelectorPrefs(new LocString("ascension", "BLITZ.NEOW.selectionScreenPrompt"), 3), context: x);
	}

	public override bool TryModifyCardRewardOptionsLate(Player player, List<CardCreationResult> cardRewards, CardCreationOptions options)
	{
		if (runState.CurrentActIndex == 0)
		{
			return false;
		}
		if (runState.CurrentActIndex == 1)
		{
			span[index] = player.PlayerRng.Rewards.NextItem(cardRewards);
		}
		else if (runState.CurrentActIndex == 2)
		{
			list = cardRewards.UnstableShuffle(player.PlayerRng.Rewards).Take(2).ToList();
		}
		return true;
	}

	public override bool TryReplaceDefaultRoomRewards(Player player, List<Reward> rewards, AbstractRoom room)
	{
		if (room.RoomType == RoomType.Monster)
		{
			rewards.Add(new CardReward(GetCardRewardOptions(player, CardRarity.Common), 3, player));
			if (room is CombatRoom combatRoom && !combatRoom.Encounter.IsWeak)
			{
				rewards.Add(new PotionReward(player));
			}
		}
		else if (room.RoomType == RoomType.Elite)
		{
			rewards.Add(new CardReward(GetCardRewardOptions(player, CardRarity.Uncommon), 3, player));
			rewards.Add(new RelicReward(player));
			rewards.Add(new RelicReward(player));
		}
		else
		{
			if (room.RoomType != RoomType.Boss || base.RunState.CurrentActIndex >= 2)
			{
				return false;
			}
			rewards.Add(new CardReward(GetCardRewardOptions(player, CardRarity.Rare), 3, player));
			rewards.Add(new PotionReward(player));
		}
		return true;
	}

	static BlitzRunModel()
	{
		span[num2] = (ModelDb.Enchantment<Sharp>(), 2);
		span[num2] = (ModelDb.Enchantment<Nimble>(), 3);
	}
"""


@pytest.fixture
def game(tmp_path, monkeypatch):
    monkeypatch.setattr(
        blitz_mode, "resolve_image_url", lambda kind, stem: f"/img/{kind}/{stem}.webp"
    )

    def put(name, text):
        path = tmp_path / name
        path.write_text(text, encoding="utf-8")
        return path

    monkeypatch.setattr(
        blitz_mode, "RUN_MODEL_FILE", put("BlitzRunModel.cs", RUN_MODEL)
    )
    monkeypatch.setattr(
        blitz_mode,
        "ACT_MAP_FILE",
        put(
            "BlitzActMap.cs",
            "pointTypes = new MapPointType[3]\n{\n\tMapPointType.Monster,\n"
            "\tMapPointType.Elite,\n\tMapPointType.RestSite\n};",
        ),
    )
    monkeypatch.setattr(
        blitz_mode,
        "ODDS_FILE",
        put(
            "CardRarityOdds.cs",
            "public const float blitzShopCommonOdds = 0.4f;\n"
            "public const float blitzShopUncommonOdds = 0.5f;\n"
            "public const float blitzShopRareOdds = 0.1f;\n"
            "public const float blitzNeowCommonOdds = 0.55f;\n"
            "public const float blitzNeowUncommonOdds = 0.4f;\n"
            "public const float blitzNeowRareOdds = 0.05f;\n",
        ),
    )
    monkeypatch.setattr(
        blitz_mode,
        "INVENTORY_FILE",
        put(
            "MerchantInventory.cs",
            "private const int _blitzEntryCount = 6;\n"
            "private const int _defaultBlitzChoices = 3;\n"
            "void Other() { GetBlitzEntries(p); int z = 0; }\n"
            "private static List<E> GetBlitzEntries(Player player)\n\t{\n"
            "\t\tList<T> list = new List<T>();\n\t\tint num = 5;\n"
            "\t\tx = WeightedNextItem(list, (T e) =>"
            " (!BlitzMerchantEntry.RareBlitzEntries.Contains(e)) ? 1f : 0.5f);\n\t}\n",
        ),
    )
    monkeypatch.setattr(
        blitz_mode,
        "TREASURE_FILE",
        put(
            "TreasureRoomRelicSynchronizer.cs",
            "if (_runState.GameMode == GameMode.Blitz)\n{\nint num;\n"
            "if (_runState.Players.Count > 1)\n{\nnum = 2;\n}\nelse\n{\n"
            "num = 1;\n_roundsLeft = 2;\n}\nfor (int i = 0; i < num; i++)",
        ),
    )
    monkeypatch.setattr(
        blitz_mode,
        "ASCENSION_LEVEL_FILE",
        put(
            "AscensionLevel.cs",
            "public enum AscensionLevel\n{\n\tNone,\n\tSwarmingElites,\n"
            "\tWearyTraveler,\n\tPoverty,\n\tTightBelt\n}\n",
        ),
    )
    monkeypatch.setattr(
        blitz_mode,
        "RELIC_LISTS_FILE",
        put(
            "RelicLists.cs",
            "notAllowedInBlitz = new HashSet<ModelId>\n{\n"
            "ModelDb.GetId<MawBank>(),\nModelDb.GetId<BlackStar>()\n};\n"
            "notAllowedLateInAct3 = new HashSet<ModelId> { ModelDb.GetId<Girya>() };",
        ),
    )
    monkeypatch.setattr(
        blitz_mode,
        "ACT_MODEL_FILE",
        put("ActModel.cs", "int num = (isBlitz ? 1 : NumberOfWeakEncounters);"),
    )
    relics = tmp_path / "relics"
    relics.mkdir()
    (relics / "PotionBelt.cs").write_text(
        "protected override bool IsAllowedInternal(IRunState r)"
        " { return r.GameMode != GameMode.Blitz; }"
    )
    (relics / "Anchor.cs").write_text("public override int X => 1;")
    monkeypatch.setattr(blitz_mode, "RELICS_DIR", relics)
    cards = tmp_path / "cards"
    cards.mkdir()
    (cards / "HandOfGreed.cs").write_text(
        "public override bool IsAllowedInBlitz => false;"
    )
    (cards / "Bash.cs").write_text("public override int Cost => 2;")
    (cards / "Doubt.cs").write_text(
        "public Doubt() : base(-1, CardType.Curse, CardRarity.Curse, TargetType.None)"
    )
    (cards / "Greed.cs").write_text(
        "public Greed() : base(-1, CardType.Curse, CardRarity.Curse, TargetType.None)\n"
        "public override bool CanBeGeneratedByModifiers => false;"
    )
    (cards / "Debt.cs").write_text(
        "public Debt() : base(-1, CardType.Curse, CardRarity.Curse, TargetType.None)\n"
        "public override bool IsAllowedInBlitz => false;"
    )
    (cards / "Hermit.cs").write_text("if (item.Type == CardType.Curse) { }")
    monkeypatch.setattr(blitz_mode, "CARDS_DIR", cards)
    return tmp_path


def test_the_act_is_the_listed_rooms_between_an_ancient_and_a_boss(game):
    assert blitz_mode.act_layout() == [
        "ANCIENT",
        "MONSTER",
        "ELITE",
        "REST_SITE",
        "BOSS",
    ]


def test_the_opening_pick_offers_ten_and_keeps_three(game):
    assert blitz_mode.neow_numbers() == {
        "cards_offered": 10,
        "cards_picked": 3,
        "rarity_odds": {"common": 0.55, "uncommon": 0.4, "rare": 0.05},
    }


def test_the_merchant_shows_five_normal_offers_and_one_cursed(game):
    rules = blitz_mode.merchant_rules({"SHARP.title": "Sharp"})
    assert rules["offers_shown"] == 6
    assert rules["normal_offers_shown"] == 5
    assert rules["cursed_offers_shown"] == 1
    assert rules["picks"] == 3
    assert rules["rare_offer_weight"] == 0.5
    assert rules["card_rarity_odds"] == {"common": 0.4, "uncommon": 0.5, "rare": 0.1}
    assert rules["enchantments"] == [
        {"id": "SHARP", "name": "Sharp", "amount": 2},
        {"id": "NIMBLE", "name": "Nimble", "amount": 3},
    ]


def test_each_fight_pays_a_fixed_rarity(game):
    assert blitz_mode.room_rewards() == [
        {
            "room": "MONSTER",
            "card_rarity": "Common",
            "card_choices": 3,
            "relics": 0,
            "potion": "after_first_fight",
        },
        {
            "room": "ELITE",
            "card_rarity": "Uncommon",
            "card_choices": 3,
            "relics": 2,
            "potion": None,
        },
        {
            "room": "BOSS",
            "card_rarity": "Rare",
            "card_choices": 3,
            "relics": 0,
            "potion": "always",
            "final_boss": False,
        },
    ]


def test_later_acts_upgrade_more_of_the_card_choices(game):
    assert blitz_mode.reward_upgrades_by_act() == [0, 1, 2]


def test_chests_hold_extra_relics(game):
    assert blitz_mode.treasure_extra_relics() == {"multiplayer": 2, "singleplayer": 1}


def test_the_ladder_takes_its_text_from_the_standard_levels(game):
    ladder = blitz_mode.ascension_ladder(
        ["WearyTraveler", "TightBelt"],
        {"LEVEL_02.title": "Weary Traveler", "LEVEL_04.description": "One less slot."},
    )
    assert ladder == [
        {
            "level": 1,
            "id": "WEARY_TRAVELER",
            "name": "Weary Traveler",
            "description": None,
        },
        {
            "level": 2,
            "id": "TIGHT_BELT",
            "name": "TightBelt",
            "description": "One less slot.",
        },
    ]


def test_banned_content_is_named_from_the_game_text(game):
    assert blitz_mode.banned_cards({"HAND_OF_GREED.title": "Hand of Greed"}) == [
        {"id": "DEBT", "name": "DEBT"},
        {"id": "HAND_OF_GREED", "name": "Hand of Greed"},
    ]
    assert blitz_mode.banned_relics({"MAW_BANK.title": "Maw Bank"}) == [
        {
            "id": "BLACK_STAR",
            "name": "BLACK_STAR",
            "image_url": "/img/relics/black_star.webp",
        },
        {
            "id": "MAW_BANK",
            "name": "Maw Bank",
            "image_url": "/img/relics/maw_bank.webp",
        },
    ]


def test_missing_game_files_leave_the_fields_out(tmp_path, monkeypatch):
    for name in dir(blitz_mode):
        if name.endswith("_FILE") or name.endswith("_DIR"):
            monkeypatch.setattr(blitz_mode, name, tmp_path / "missing")
    assert blitz_mode.blitz_details({}, []) == {}
    assert blitz_mode.merchant_entries({}, {}) == []


def test_the_first_fight_of_an_act_comes_from_the_easy_pool(game):
    details = blitz_mode.blitz_details({}, [])
    assert details["weak_encounters_per_act"] == 1
    assert details["encounters_per_act"] == 3
    assert details["floors_per_act"] == 5
    assert details["act_rooms"][1]["image_url"] == "/img/blitz/room_monster.webp"
    assert [room.get("easy") for room in details["act_rooms"]] == [
        None,
        True,
        None,
        None,
        None,
    ]


def test_cursed_offers_draw_from_the_curses_the_mode_allows(game):
    assert blitz_mode.merchant_curses({"DOUBT.title": "Doubt"}) == [
        {"id": "DOUBT", "name": "Doubt"}
    ]


def test_relics_cut_late_in_the_run_start_at_the_last_elite(game):
    layout = [
        "ANCIENT",
        "MONSTER",
        "MONSTER",
        "SHOP",
        "ELITE",
        "TREASURE",
        "REST_SITE",
        "BOSS",
    ]
    late = blitz_mode.late_relics(
        {"GIRYA.title": "Girya"}, layout, [{"id": "MAW_BANK", "name": "Maw Bank"}]
    )
    assert late == {
        "from_floor": 21,
        "relics": [
            {"id": "GIRYA", "name": "Girya", "image_url": "/img/relics/girya.webp"},
            {
                "id": "POTION_BELT",
                "name": "POTION_BELT",
                "image_url": "/img/relics/potion_belt.webp",
            },
        ],
    }
    assert blitz_mode.late_relics({}, ["ANCIENT", "BOSS"], []) == {}
