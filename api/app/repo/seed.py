"""Demo content: a feedback board for "Larder", a made-up meal-planning app.

Deterministic (fixed RNG seed) so tests and screenshots are stable, but dated
relative to "now" so the dashboard charts always look current.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..auth import DEMO_USERS

ADMIN_ID = DEMO_USERS["admin"]
MEMBER_ID = DEMO_USERS["member"]

# id -> (display_name, role)
NAMED_USERS: dict[str, tuple[str, str]] = {
    ADMIN_ID: ("Maya Okafor", "admin"),
    "00000000-0000-4000-8000-00000000a002": ("Leo Brandt", "admin"),
    MEMBER_ID: ("Sam Lindqvist", "member"),
    "00000000-0000-4000-8000-00000000c001": ("Priya Raman", "member"),
    "00000000-0000-4000-8000-00000000c002": ("Tomás Herrera", "member"),
    "00000000-0000-4000-8000-00000000c003": ("Jun Watanabe", "member"),
    "00000000-0000-4000-8000-00000000c004": ("Ellie Brooks", "member"),
    "00000000-0000-4000-8000-00000000c005": ("Kwame Mensah", "member"),
    "00000000-0000-4000-8000-00000000c006": ("Hannah Fischer", "member"),
    "00000000-0000-4000-8000-00000000c007": ("Diego Alvarez", "member"),
    "00000000-0000-4000-8000-00000000c008": ("Noor Haddad", "member"),
    "00000000-0000-4000-8000-00000000c009": ("Ines Duarte", "member"),
}

_BY_NAME = {name.split()[0].lower(): uid for uid, (name, _) in NAMED_USERS.items()}


def uid(first_name: str) -> str:
    return _BY_NAME[first_name.lower()]


@dataclass
class SeedPost:
    key: str
    title: str
    body: str
    category: str
    status: str
    author: str
    age_days: float
    popularity: int  # target vote count
    pinned: bool = False
    merged_into: str | None = None


POSTS: list[SeedPost] = [
    SeedPost(
        "reminders",
        "Sync the shopping list to Apple Reminders",
        "We split the shop between two phones and Reminders is what my partner actually opens "
        "in the supermarket. A one-way push of this week's list into a shared Reminders list "
        "would be plenty. I don't need it to sync back.",
        "feature",
        "planned",
        "priya",
        61,
        47,
    ),
    SeedPost(
        "timers",
        "Cook-mode timers reset when the phone locks",
        "Started the 25 minute timer on the lasagne step, locked the phone, came back to 0:00 "
        "and no alarm ever went off.\n\niPhone 15, iOS 19.1, Larder 4.2.0. Happens every time "
        "the app is in the background for more than about a minute.",
        "bug",
        "in_progress",
        "tomás",
        19,
        38,
        pinned=True,
    ),
    SeedPost(
        "scale",
        "Scale recipes to any number of servings, not just ×2 and ×½",
        "I cook for three. Let me type 3 and have the quantities recalculated, rounded to "
        "something a person would actually measure. Nobody needs 0.67 of an egg.",
        "improvement",
        "done",
        "jun",
        70,
        52,
    ),
    SeedPost(
        "import",
        "Import a recipe from a link",
        "Paste a URL from a food blog, get the ingredients and the steps without the life "
        "story. Bonus points if it keeps the source link so the author still gets credit.",
        "feature",
        "done",
        "ellie",
        68,
        58,
    ),
    SeedPost(
        "staples",
        "Mark pantry staples so they stay off the shopping list",
        'Salt, olive oil and black pepper land on every single list. An "always have it" '
        "toggle per ingredient would save me deleting them every Sunday night.",
        "feature",
        "planned",
        "kwame",
        44,
        33,
    ),
    SeedPost(
        "nutrition",
        "Nutrition per serving on the recipe card",
        "Calories, protein, carbs and fat per serving would be enough. I'm not after a full "
        "tracker, just a rough idea when I'm choosing between two dinners.",
        "feature",
        "under_review",
        "hannah",
        12,
        21,
    ),
    SeedPost(
        "drag",
        "Drag a meal to a different day in the week planner",
        "Right now moving Tuesday's curry to Thursday means deleting it and adding it again. "
        'Dragging between days (and onto a "leftovers" slot) would match how plans actually '
        "change midweek.",
        "improvement",
        "in_progress",
        "diego",
        37,
        29,
    ),
    SeedPost(
        "units",
        "Imported recipes mix cups and grams",
        "Imported a UK recipe and the flour came through in cups while the butter stayed in "
        "grams. It should pick one system per recipe based on my units setting.",
        "bug",
        "under_review",
        "noor",
        5,
        9,
    ),
    SeedPost(
        "household",
        "Different dietary needs within one household",
        "My daughter is vegetarian and the rest of us aren't. When I plan the week, flag meals "
        "that don't work for someone, and maybe suggest a swap for their portion.",
        "feature",
        "planned",
        "ines",
        52,
        26,
    ),
    SeedPost(
        "darkmode",
        "Dark mode for cook view",
        "The bright white screen at 7am is brutal. Cook view in particular should follow the "
        "system appearance.",
        "feature",
        "done",
        "sam",
        66,
        41,
    ),
    SeedPost(
        "search",
        "Search doesn't find recipes by ingredient",
        'Searching "chickpea" only matches recipe titles. I\'d expect it to find the curry '
        "that uses two tins of them.",
        "bug",
        "in_progress",
        "priya",
        24,
        18,
    ),
    SeedPost(
        "awake",
        "Keep the screen awake in cook mode",
        "Hands covered in dough, screen goes dark, I end up unlocking it with my nose. Cook "
        "mode should keep the display on until I leave it.",
        "improvement",
        "done",
        "hannah",
        58,
        36,
    ),
    SeedPost(
        "sleep",
        "Phone goes to sleep while I'm following a recipe",
        "Can the app stop the phone from sleeping while a recipe is open?",
        "improvement",
        "merged",
        "kwame",
        40,
        0,
        merged_into="awake",
    ),
    SeedPost(
        "print",
        "Print a clean one-page version of a recipe",
        "For the ring binder in the kitchen. Ingredients on the left, steps on the right, no "
        "photos, fits on one A4 page.",
        "feature",
        "under_review",
        "ellie",
        9,
        14,
    ),
    SeedPost(
        "leftovers",
        'Track leftovers with a "use by" nudge',
        "We throw away too much. When I mark a meal as having leftovers, remind me two days "
        "later before it turns into a science project.",
        "feature",
        "under_review",
        "jun",
        3,
        11,
    ),
    SeedPost(
        "copyweek",
        "Copy last week's plan into next week",
        "We rotate about four weeks of meals. Copying a past week and tweaking two days would "
        "take seconds instead of the fifteen minutes it takes now.",
        "feature",
        "planned",
        "diego",
        33,
        31,
    ),
    SeedPost(
        "barcode",
        "Scan barcodes to add pantry items",
        "Scan a tin of tomatoes, it's in the pantry. Faster than typing.",
        "feature",
        "declined",
        "tomás",
        49,
        12,
    ),
    SeedPost(
        "aisles",
        "Let me reorder shopping list aisles",
        "My supermarket has produce at the back and bakery by the door. Let me drag the aisle "
        "groups into my store's order once and remember it.",
        "improvement",
        "under_review",
        "noor",
        15,
        17,
    ),
    SeedPost(
        "cost",
        "Rough cost per meal",
        "Even a ballpark from ingredient prices I enter myself would help us stick to a "
        "grocery budget.",
        "feature",
        "under_review",
        "ines",
        21,
        8,
    ),
    SeedPost(
        "widget",
        "Android home-screen widget for today's meals",
        "iOS got the widget last spring. A small Android one showing today's breakfast, lunch "
        "and dinner would be great.",
        "feature",
        "planned",
        "kwame",
        28,
        24,
    ),
    SeedPost(
        "subs",
        "Show ingredient substitutions inline",
        'If I\'m out of buttermilk, show "milk + a squeeze of lemon" right there in the '
        "ingredient list instead of me searching mid-recipe.",
        "improvement",
        "under_review",
        "priya",
        2,
        6,
    ),
    SeedPost(
        "spam",
        "Sign-in emails land in Outlook's junk folder",
        "Every magic link I get ends up in junk on Outlook.com. Took me a while to figure out "
        'why sign-in "wasn\'t working".',
        "bug",
        "done",
        "hannah",
        47,
        15,
    ),
    SeedPost(
        "export",
        "Export everything as JSON or CSV",
        "I want a backup I control. Recipes, plans and lists as a zip of plain files is fine.",
        "feature",
        "under_review",
        "sam",
        6,
        13,
    ),
    SeedPost(
        "library",
        "Recipe library is slow with 500+ recipes",
        "The library takes around four seconds to appear on my 2021 iPad. Lazy-loading the "
        "photos might be enough.",
        "improvement",
        "in_progress",
        "jun",
        30,
        19,
    ),
    SeedPost(
        "tags",
        "Tag recipes and filter by tag",
        '"Weeknight", "freezer-friendly", "kids will eat it". Folders don\'t work because '
        "a recipe can be all three.",
        "feature",
        "under_review",
        "diego",
        11,
        22,
    ),
    SeedPost(
        "voice",
        'Say "next step" while cooking',
        "Hands-free stepping through a recipe. Even just next / previous / repeat would do.",
        "feature",
        "under_review",
        "ellie",
        1,
        4,
    ),
]

# (post key, author first name, days after the post was created, body)
COMMENTS: list[tuple[str, str, float, str]] = [
    ("reminders", "sam", 2, "Same here. Even a share-sheet export to Reminders would do for now."),
    (
        "reminders",
        "maya",
        9,
        "This is on the plan for the next cycle. We're starting with a "
        "one-way push to a list you choose, which matches what most of you described.",
    ),
    ("reminders", "noor", 20, "Would love Google Keep as well, but Reminders first makes sense."),
    ("timers", "jun", 1, "Can confirm on iOS 19.1, iPhone 13 mini."),
    (
        "timers",
        "leo",
        3,
        "Thanks for the clear repro. Background timers weren't scheduled as "
        "local notifications. A fix is in progress and should land in 4.2.2.",
    ),
    ("timers", "priya", 6, "Happens on iPad too, if that helps."),
    (
        "scale",
        "maya",
        40,
        "Shipped in 4.1. Quantities round to the nearest sensible measure, "
        "and eggs round to whole numbers.",
    ),
    ("scale", "ellie", 42, "Works great. The egg rounding made me laugh."),
    (
        "import",
        "kwame",
        4,
        "Most of the sites I use have recipe schema markup, so hopefully this is doable.",
    ),
    (
        "import",
        "maya",
        35,
        "Live now. If a site doesn't import cleanly, post the link here and we'll take a look.",
    ),
    ("staples", "ines", 3, "Yes please. Also flour and sugar for me."),
    (
        "staples",
        "hannah",
        10,
        "Could it ask once whether something is a staple the first time it shows up?",
    ),
    ("nutrition", "diego", 2, "Would be good even if it's an estimate."),
    ("drag", "sam", 5, "And dragging onto the shopping list to add the ingredients?"),
    (
        "drag",
        "leo",
        20,
        "Working on this now. Drag between days first, the leftovers slot right after.",
    ),
    ("household", "priya", 7, "Same situation with a gluten-free partner."),
    (
        "darkmode",
        "maya",
        50,
        "Cook view now follows the system setting. You can also force it "
        "under Settings > Appearance.",
    ),
    ("search", "leo", 4, "Ingredient search is being added along with a faster search index."),
    (
        "awake",
        "maya",
        30,
        "Shipped. Cook mode keeps the screen on until you leave it or after "
        "45 minutes of no interaction.",
    ),
    ("sleep", "maya", 2, "Merging this into the existing request so the votes count together."),
    ("print", "noor", 2, "A4 and US Letter please."),
    (
        "barcode",
        "maya",
        12,
        "We tried this in a prototype. The barcode databases we can use "
        "miss most fresh and regional products, so it was slower than typing for most people. "
        "Closing for now, but thanks for pushing on it.",
    ),
    ("barcode", "tomás", 13, "Fair enough, thanks for explaining."),
    ("aisles", "kwame", 3, "Big yes. Mine has dairy halfway down, not at the end."),
    ("widget", "ellie", 6, "Seconding this from a Pixel 8."),
    (
        "spam",
        "leo",
        2,
        "We've set up proper DKIM and a dedicated sending domain. Let us know "
        "if links still end up in junk.",
    ),
    ("spam", "hannah", 5, "Landing in the inbox now. Thank you!"),
    (
        "export",
        "jun",
        1,
        "Plain-text export would also make moving to another app possible, "
        "which is a good sign of trust.",
    ),
    ("library", "leo", 8, "Photos now load lazily in the beta. Text-only rows render first."),
    ("tags", "sam", 3, 'Tags plus a "not made in a while" filter would be ideal.'),
    ("subs", "ines", 1, "This would save so many trips to the shop."),
]

# Status history for posts that left "under review": (days after creation, status).
STATUS_TRAIL: dict[str, list[tuple[float, str]]] = {
    "reminders": [(9, "planned")],
    "timers": [(3, "in_progress")],
    "scale": [(6, "planned"), (22, "in_progress"), (40, "done")],
    "import": [(5, "planned"), (18, "in_progress"), (35, "done")],
    "staples": [(12, "planned")],
    "drag": [(8, "planned"), (20, "in_progress")],
    "household": [(15, "planned")],
    "darkmode": [(4, "planned"), (30, "in_progress"), (50, "done")],
    "search": [(4, "in_progress")],
    "awake": [(7, "planned"), (21, "in_progress"), (30, "done")],
    "copyweek": [(10, "planned")],
    "barcode": [(12, "declined")],
    "widget": [(9, "planned")],
    "spam": [(2, "in_progress"), (5, "done")],
    "library": [(8, "in_progress")],
}
