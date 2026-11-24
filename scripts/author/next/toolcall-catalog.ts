// Hand-written tool catalog for the toolcall generators: JSON Schema tools in
// the shape of real APIs (each API keeps one naming style), grouped by domain,
// plus request templates for the tools a generator targets. Vendored
// real-world schemas (toolcall-vendored.json, see NOTICE) fill catalogs out.

import { readFileSync } from "node:fs";
import type { Rng } from "./data-common.js";
import { pad } from "./data-common.js";

export type Prop =
  | { type: "string"; description?: string; enum?: string[]; default?: string }
  | { type: "integer" | "number"; description?: string; default?: number }
  | { type: "boolean"; description?: string; default?: boolean }
  | { type: "array"; description?: string; items: Prop }
  | Obj;
export interface Obj {
  type: "object";
  description?: string;
  properties: Record<string, Prop>;
  required: string[];
}
export interface Tool {
  name: string;
  description: string;
  parameters: Obj;
}
export type Args = Record<string, unknown>;
export type Domain =
  | "weather"
  | "travel"
  | "calendar"
  | "messaging"
  | "files"
  | "accounts"
  | "commerce"
  | "finance"
  | "media"
  | "home"
  | "devops"
  | "health"
  | "food"
  | "events"
  | "other";
export type Lang = "en" | "es" | "fr" | "de";

export interface CatalogTool {
  tool: Tool;
  domain: Domain;
  /** BFCL row the schema was vendored from; absent for hand-written tools. */
  source?: string;
}

// ── Schema helpers ──────────────────────────────────────────────────────────
const str = (description: string, extra: { enum?: string[]; default?: string } = {}): Prop => ({
  type: "string",
  description,
  ...extra,
});
const int = (description: string, dflt?: number): Prop =>
  dflt === undefined
    ? { type: "integer", description }
    : { type: "integer", description, default: dflt };
const num = (description: string): Prop => ({ type: "number", description });
const bool = (description: string, dflt?: boolean): Prop =>
  dflt === undefined
    ? { type: "boolean", description }
    : { type: "boolean", description, default: dflt };
const arr = (description: string, items: Prop): Prop => ({ type: "array", description, items });
const obj = (description: string, properties: Record<string, Prop>, required: string[]): Prop => ({
  type: "object",
  description,
  properties,
  required,
});
const tool = (
  name: string,
  description: string,
  properties: Record<string, Prop>,
  required: string[],
): Tool => ({ name, description, parameters: { type: "object", properties, required } });

// ── Value pools (spelled the same in every request language) ────────────────
export const CITIES = [
  "Oslo",
  "Nairobi",
  "Osaka",
  "Denver",
  "Lima",
  "Dubai",
  "Seoul",
  "Perth",
  "Tbilisi",
];
export const AIRPORTS = ["JFK", "LHR", "NRT", "SFO", "CDG", "YYZ", "SYD", "GRU", "NBO", "ICN"];
export const EMAILS = [
  "ana.ruiz@example.com",
  "j.okafor@example.org",
  "mei.tan@example.net",
  "lars.berg@example.com",
  "priya.n@example.org",
];
export const PEOPLE = ["Ruth Abebe", "Tomas Lind", "Keiko Mori", "Samir Haddad", "Lena Vogt"];
export const isoDate = (rng: Rng) =>
  `${rng.int(2025, 2026)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`;
export const hhmm = (rng: Rng) => `${pad(rng.int(8, 17))}:${rng.pick(["00", "15", "30", "45"])}`;
const digits = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.int(0, 9)).join("");
export const orderId = (rng: Rng) => `ORD-${rng.int(100000, 999999)}`;

const has = (a: Args, k: string) => k in a;
/** Phrase for an optional argument when the request states it. */
const when = (a: Args, k: string, f: (v: never) => string) => (has(a, k) ? f(a[k] as never) : "");
export const list = (xs: unknown[], and = "and") =>
  xs.length <= 1 ? String(xs[0]) : `${xs.slice(0, -1).join(", ")} ${and} ${String(xs.at(-1))}`;

// ── weather (snake_case) ────────────────────────────────────────────────────
const UNITS = str("Temperature unit for every value in the response: celsius or fahrenheit.", {
  enum: ["celsius", "fahrenheit"],
  default: "celsius",
});
export const getCurrentWeather = tool(
  "get_current_weather",
  "Get the current weather conditions (temperature, wind, precipitation) for a city, as observed right now.",
  {
    location: str("City name, optionally with a country, e.g. 'Lisbon' or 'Lisbon, Portugal'."),
    units: UNITS,
    include_air_quality: bool(
      "Also return the current air quality index and dominant pollutant.",
      false,
    ),
  },
  ["location"],
);
export const getWeatherForecast = tool(
  "get_weather_forecast",
  "Get the daily weather forecast for a city, starting tomorrow, for up to ten days ahead.",
  {
    location: str("City name, optionally with a country, e.g. 'Lisbon' or 'Lisbon, Portugal'."),
    days: int("Number of days to forecast, from 1 to 10, starting with tomorrow."),
    units: UNITS,
    hourly: bool("Break each forecast day into hourly values instead of a daily summary.", false),
    fields: arr(
      "Forecast fields to return, in any order; all fields when left out.",
      str("One forecast field.", {
        enum: ["temperature", "precipitation", "wind", "humidity", "uv_index"],
      }),
    ),
  },
  ["location", "days"],
);
export const getHistoricalWeather = tool(
  "get_historical_weather",
  "Get the weather that was recorded in a city on a past date: temperatures, rainfall and wind.",
  {
    location: str("City name, optionally with a country, e.g. 'Lisbon' or 'Lisbon, Portugal'."),
    date: str("The past date to look up, formatted as YYYY-MM-DD."),
    units: UNITS,
    granularity: str("Return one summary for the day or one value per hour.", {
      enum: ["daily", "hourly"],
      default: "daily",
    }),
  },
  ["location", "date"],
);

// ── flights (Schema-Guided-Dialogue style) ──────────────────────────────────
export const flightSearch = tool(
  "Flights_2_SearchOnewayFlight",
  "Search for one-way flights between two airports on a given date and list the options with prices.",
  {
    origin_airport: str("IATA code of the departure airport, e.g. 'JFK' for New York JFK."),
    destination_airport: str("IATA code of the arrival airport, e.g. 'LHR' for London Heathrow."),
    departure_date: str("Date of departure, formatted as YYYY-MM-DD."),
    number_of_tickets: int("Number of passenger tickets to price, between 1 and 9.", 1),
    seating_class: str("Cabin class to search in.", {
      enum: ["Economy", "Premium Economy", "Business", "First"],
      default: "Economy",
    }),
    nonstop_only: bool("Only return flights without a connection.", false),
  },
  ["origin_airport", "destination_airport", "departure_date"],
);
export const flightStatus = tool(
  "Flights_2_GetFlightStatus",
  "Get the live status of one scheduled flight: gate, departure and arrival times, delays or cancellation.",
  {
    flight_number: str("Airline flight number, e.g. 'BA117', exactly as printed on the ticket."),
    date: str("Scheduled departure date of the flight, formatted as YYYY-MM-DD."),
  },
  ["flight_number", "date"],
);
export const flightCancel = tool(
  "Flights_2_CancelReservation",
  "Cancel an existing flight reservation by its confirmation code and refund it per the fare rules.",
  {
    confirmation_code: str("Six-character booking confirmation code, e.g. 'K7QX2M'."),
    refund_to: str("Where the refund goes: the original card or a travel credit.", {
      enum: ["original_payment", "travel_credit"],
      default: "original_payment",
    }),
  },
  ["confirmation_code"],
);
export const flightReserve = tool(
  "Flights_2_ReserveFlight",
  "Reserve seats on a specific scheduled flight and return a booking confirmation code.",
  {
    flight_number: str("Airline flight number, e.g. 'BA117', exactly as listed in search results."),
    date: str("Scheduled departure date of the flight, formatted as YYYY-MM-DD."),
    number_of_tickets: int("Number of passenger tickets to reserve, between 1 and 9.", 1),
  },
  ["flight_number", "date"],
);

// ── calendar (dotted) ───────────────────────────────────────────────────────
export const calCreate = tool(
  "calendar.create_event",
  "Create a new event on the user's primary calendar and send invitations to any attendees listed.",
  {
    title: str("Short title shown on the calendar, e.g. 'Design review'."),
    start: str("Local start date and time of the event, formatted as YYYY-MM-DDTHH:MM."),
    duration_minutes: int(
      "Length of the event in minutes; the calendar default is half an hour.",
      30,
    ),
    attendees: arr("Email addresses of the people to invite, in any order.", str("Email address")),
    location: str("Room name or address where the event takes place, as free text."),
    reminder_minutes: int("Minutes before the start at which to send a reminder notification.", 10),
    visibility: str("Who can see the event details on shared calendars.", {
      enum: ["default", "public", "private"],
      default: "default",
    }),
    recurrence: obj(
      "Repeat rule for a recurring event; a one-off event when left out.",
      {
        frequency: str("How often the event repeats.", { enum: ["daily", "weekly", "monthly"] }),
        count: int("Total number of occurrences, the first one included."),
      },
      ["frequency", "count"],
    ),
  },
  ["title", "start"],
);
export const calList = tool(
  "calendar.list_events",
  "List the events on one day of a calendar, with their ids, titles, start times and attendees.",
  {
    date: str("The day to list, formatted as YYYY-MM-DD, in the calendar's time zone."),
    calendar_id: str("Which calendar to read; 'primary' is the user's own calendar.", {
      default: "primary",
    }),
    include_declined: bool("Also list events the user has declined.", false),
    max_results: int("Maximum number of events to return, earliest first.", 50),
  },
  ["date"],
);
export const calDelete = tool(
  "calendar.delete_event",
  "Delete one event from the calendar by its id; attendees can be told that it was cancelled.",
  {
    event_id: str("Event id exactly as returned by calendar.list_events, e.g. 'evt_3k9w'."),
    notify_attendees: bool("Email the attendees a cancellation notice.", true),
  },
  ["event_id"],
);

// ── email (snake_case) ──────────────────────────────────────────────────────
const RECIPIENTS = arr("Recipient email addresses, in any order.", str("Email address"));
export const sendEmail = tool(
  "send_email",
  "Send an email right away from the user's mailbox to one or more recipients, with optional copies.",
  {
    to: RECIPIENTS,
    subject: str("Subject line of the message, copied exactly as the user gives it."),
    body: str("Plain-text body of the message, copied exactly as the user gives it."),
    cc: arr("Addresses to copy on the message, in any order.", str("Email address")),
    priority: str("Importance flag shown to the recipients.", {
      enum: ["low", "normal", "high"],
      default: "normal",
    }),
    attachments: arr(
      "Files from the user's drive to attach, by drive path, in any order.",
      str("Drive path of one file, e.g. '/Shared/budget.xlsx'."),
    ),
  },
  ["to", "subject", "body"],
);
export const scheduleEmail = tool(
  "schedule_email",
  "Queue an email to be sent automatically at a later date and time instead of right away.",
  {
    to: RECIPIENTS,
    subject: str("Subject line of the message, copied exactly as the user gives it."),
    body: str("Plain-text body of the message, copied exactly as the user gives it."),
    send_at: str("Local date and time to send the message, formatted as YYYY-MM-DDTHH:MM."),
  },
  ["to", "subject", "body", "send_at"],
);
export const saveDraft = tool(
  "save_draft",
  "Save an email as a draft in the user's mailbox without sending it; recipients may be left empty.",
  {
    subject: str("Subject line of the draft, copied exactly as the user gives it."),
    body: str("Plain-text body of the draft, copied exactly as the user gives it."),
    to: RECIPIENTS,
  },
  ["subject", "body"],
);

// ── files (camelCase) ───────────────────────────────────────────────────────
export const listFiles = tool(
  "listFiles",
  "List the entries of a directory on the file server with their sizes and modification times.",
  {
    path: str("Absolute path of the directory to list, e.g. '/var/log'."),
    recursive: bool("Descend into subdirectories and list their entries too.", false),
    includeHidden: bool("Include dotfiles and other hidden entries in the listing.", false),
    sortBy: str("Field the listing is sorted by.", {
      enum: ["name", "size", "modified"],
      default: "name",
    }),
    limit: int("Maximum number of entries to return in one response.", 100),
  },
  ["path"],
);
export const getFileInfo = tool(
  "getFileInfo",
  "Get the metadata of one file or directory: size, owner, permissions and timestamps.",
  { path: str("Absolute path of the file or directory to inspect.") },
  ["path"],
);
export const deleteFile = tool(
  "deleteFile",
  "Delete one file by path; by default it is moved to the trash, where it can still be restored.",
  {
    path: str("Absolute path of the file to delete, exactly as listed."),
    permanent: bool("Delete permanently instead of moving the file to the trash.", false),
  },
  ["path"],
);
export const moveFile = tool(
  "moveFile",
  "Move or rename a single file on the file server; the destination is the file's full new path.",
  {
    sourcePath: str("Absolute path of the file to move, exactly as the user gives it."),
    destinationPath: str("Absolute new path of the file, including its file name."),
    overwrite: bool("Replace an existing file at the destination instead of failing.", false),
  },
  ["sourcePath", "destinationPath"],
);
export const searchFiles = tool(
  "searchFiles",
  "Find files below a directory whose names match a glob pattern, with their sizes and timestamps.",
  {
    directory: str("Absolute path of the directory to search from, e.g. '/srv/reports'."),
    pattern: str("Glob pattern the file name must match, e.g. '*.csv' or 'invoice-*'."),
    recursive: bool("Search subdirectories as well as the directory itself.", true),
    maxResults: int("Maximum number of matching files to return.", 50),
    excludePatterns: arr(
      "Glob patterns of file names to leave out, in any order.",
      str("Glob pattern"),
    ),
  },
  ["directory", "pattern"],
);
export const compressFiles = tool(
  "compressFiles",
  "Pack a set of files into a single zip archive on the file server and return the archive's path.",
  {
    paths: arr("Absolute paths of the files to pack, in any order.", str("Absolute file path")),
    archivePath: str("Absolute path of the zip archive to create, ending in '.zip'."),
  },
  ["paths", "archivePath"],
);

// ── orders and shipping (snake_case) ────────────────────────────────────────
const CARRIERS = ["ups", "fedex", "dhl", "usps"];
export const orderStatus = tool(
  "get_order_status",
  "Look up an order placed in our store: its items, payment state, shipping carrier and tracking number.",
  {
    order_id: str("Store order id, formatted like 'ORD-123456'."),
    include: arr(
      "Extra sections to include in the response, in any order.",
      str("Section name.", { enum: ["items", "payments", "shipping", "returns"] }),
    ),
  },
  ["order_id"],
);
export const trackPackage = tool(
  "track_package",
  "Get the delivery status and scan history of a parcel from its carrier and tracking number.",
  {
    carrier: str("Shipping carrier that holds the parcel, in lower case.", { enum: CARRIERS }),
    tracking_number: str("The carrier's tracking number, exactly as given, digits as a string."),
    language: str("Language of the scan descriptions in the response.", {
      enum: ["en", "es", "fr", "de"],
      default: "en",
    }),
  },
  ["carrier", "tracking_number"],
);
export const cancelOrder = tool(
  "cancel_order",
  "Cancel a store order that has not been delivered yet and refund it to the chosen payment method.",
  {
    order_id: str("Store order id, formatted like 'ORD-123456'."),
    reason: str("Why the customer is cancelling, used for reporting.", {
      enum: ["changed_mind", "found_cheaper", "ordered_by_mistake", "arrives_too_late"],
    }),
    refund_method: str("Where the refund is paid: the original card or store credit.", {
      enum: ["original_payment", "store_credit"],
      default: "original_payment",
    }),
  },
  ["order_id", "reason"],
);
const COUNTRIES: [string, string][] = [
  ["US", "United States"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["JP", "Japan"],
];
export const createShipment = tool(
  "create_shipment",
  "Create a parcel shipment with a label for one recipient and book the carrier pickup for it.",
  {
    recipient: obj(
      "Who receives the parcel and where it is delivered.",
      {
        name: str("Recipient's full name as it should appear on the label."),
        street: str("Street address line, exactly as written."),
        postal_code: str("Postal code, exactly as written, as a string."),
        country: str("ISO 3166-1 alpha-2 country code.", { enum: COUNTRIES.map(([c]) => c) }),
      },
      ["name", "street", "postal_code", "country"],
    ),
    weight_kg: num("Total parcel weight in kilograms, including the packaging."),
    items: arr(
      "Contents of the parcel, one entry per stock-keeping unit.",
      obj(
        "One line of the contents.",
        { sku: str("Stock-keeping unit, exactly as written."), quantity: int("Units.") },
        ["sku", "quantity"],
      ),
    ),
    service: str("Delivery speed to book with the carrier.", {
      enum: ["ground", "express", "overnight"],
      default: "ground",
    }),
    signature_required: bool("Require a signature on delivery.", false),
  },
  ["recipient", "weight_kg", "items"],
);
export const shippingQuote = tool(
  "get_shipping_quote",
  "Price a parcel shipment to a destination without creating it or booking a carrier pickup.",
  {
    postal_code: str("Destination postal code, exactly as written, as a string."),
    country: str("ISO 3166-1 alpha-2 country code of the destination."),
    weight_kg: num("Total parcel weight in kilograms, including the packaging."),
    dimensions_cm: obj(
      "Outer size of the parcel in centimetres; priced as a standard box when left out.",
      { length: num("Length in cm."), width: num("Width in cm."), height: num("Height in cm.") },
      ["length", "width", "height"],
    ),
  },
  ["postal_code", "country", "weight_kg"],
);

// ── inventory (snake_case) ──────────────────────────────────────────────────
export const adjustInventory = tool(
  "adjust_inventory",
  "Record a relative change in stock for one SKU, with the reason, for the warehouse audit trail.",
  {
    sku: str("Stock-keeping unit, exactly as written, including leading zeros."),
    delta: int("Change in units: positive adds stock, negative removes it."),
    reason: str("Why the stock changed.", { enum: ["sale", "return", "damage", "restock"] }),
    tags: arr("Free-form labels for the audit trail, in any order.", str("Label")),
    warehouse: str("Warehouse code the change applies to.", { default: "MAIN" }),
  },
  ["sku", "delta", "reason"],
);
export const setStockLevel = tool(
  "set_stock_level",
  "Overwrite the stock count of one SKU with an absolute number after a physical count.",
  {
    sku: str("Stock-keeping unit, exactly as written, including leading zeros."),
    quantity: int("New absolute number of units on hand."),
    warehouse: str("Warehouse code the count applies to.", { default: "MAIN" }),
  },
  ["sku", "quantity"],
);

// ── banking (Schema-Guided-Dialogue style) ──────────────────────────────────
const ACCOUNT = str("Which of the user's accounts to use.", {
  enum: ["checking", "savings"],
  default: "checking",
});
export const bankBalance = tool(
  "Banking_1_CheckBalance",
  "Get the current and available balance of one of the user's bank accounts, in the account currency.",
  { account_type: ACCOUNT },
  [],
);
export const bankTransfer = tool(
  "Banking_1_TransferMoney",
  "Transfer money from one of the user's accounts to another account number, executed immediately.",
  {
    amount: num("Amount to transfer in the account currency, e.g. 125.5."),
    recipient_account: str("Recipient's account number or IBAN, exactly as given."),
    account_type: ACCOUNT,
    memo: str("Reference text the recipient sees on their statement."),
  },
  ["amount", "recipient_account"],
);
export const bankTransactions = tool(
  "Banking_1_ListTransactions",
  "List the transactions of one of the user's accounts between two dates, newest first.",
  {
    start_date: str("First day to include, formatted as YYYY-MM-DD."),
    end_date: str("Last day to include, formatted as YYYY-MM-DD."),
    account_type: ACCOUNT,
    min_amount: num("Only list transactions of at least this absolute amount."),
    categories: arr(
      "Only list transactions in these categories, in any order.",
      str("Category.", { enum: ["groceries", "rent", "travel", "utilities", "salary", "other"] }),
    ),
  },
  ["start_date", "end_date"],
);

// ── currency (snake_case) ───────────────────────────────────────────────────
export const CODES = ["USD", "EUR", "GBP", "JPY", "CAD", "CHF", "AUD", "SEK"];
export const convertCurrency = tool(
  "convert_currency",
  "Convert an amount of money from one currency to another at today's mid-market exchange rate.",
  {
    amount: num("Amount in the source currency, e.g. 250 or 99.95."),
    from_currency: str("ISO 4217 code of the source currency, e.g. 'USD'."),
    to_currency: str("ISO 4217 code of the target currency, e.g. 'EUR'."),
  },
  ["amount", "from_currency", "to_currency"],
);
export const exchangeRate = tool(
  "get_exchange_rate",
  "Get the exchange rate between two currencies on a date; no amount is converted.",
  {
    base_currency: str("ISO 4217 code of the base currency, e.g. 'USD'."),
    quote_currency: str("ISO 4217 code of the quote currency, e.g. 'EUR'."),
    date: str("Date of the rate, formatted as YYYY-MM-DD; today when left out."),
  },
  ["base_currency", "quote_currency"],
);

// ── smart home (dotted) ─────────────────────────────────────────────────────
const ZONES = ["living_room", "bedroom", "office", "kitchen"];
export const setThermostat = tool(
  "home.set_thermostat",
  "Set the target temperature and operating mode of the thermostat in one zone of the house.",
  {
    zone: str("Heating and cooling zone the thermostat controls.", { enum: ZONES }),
    target_temp_c: num("Target temperature in degrees Celsius, between 10 and 30."),
    mode: str("Operating mode: heat only, cool only, or switch automatically.", {
      enum: ["heat", "cool", "auto"],
      default: "auto",
    }),
    hold_until: str(
      "Keep this setting until the given local time HH:MM, then resume the schedule.",
    ),
  },
  ["zone", "target_temp_c"],
);
export const setLights = tool(
  "home.set_lights",
  "Switch the lights in one room on or off and, when switching on, set their brightness level.",
  {
    room: str("Room whose lights to control.", { enum: ZONES }),
    on: bool("true to switch the lights on, false to switch them off."),
    brightness_pct: int("Brightness from 1 to 100 percent when switching on.", 100),
    color: obj(
      "Colour for colour-capable bulbs as hue and saturation; warm white when left out.",
      {
        hue: int("Hue angle from 0 to 359 degrees."),
        saturation: int("Saturation from 0 to 100 percent."),
      },
      ["hue", "saturation"],
    ),
  },
  ["room", "on"],
);
export const deviceStatus = tool(
  "home.get_device_status",
  "Get the current state of every smart device in one room: power, temperature and battery levels.",
  {
    room: str("Room to report on.", { enum: ZONES }),
    include_offline: bool("Also list devices that are currently unreachable.", false),
  },
  ["room"],
);

// ── kubernetes (dotted) ─────────────────────────────────────────────────────
const NAMESPACE = str("Kubernetes namespace the resource lives in.", { default: "default" });
export const kubeScale = tool(
  "kube.scale_deployment",
  "Set the number of replicas of a Kubernetes deployment; the cluster adds or removes pods to match.",
  {
    deployment: str("Name of the deployment, exactly as given, e.g. 'checkout-api'."),
    replicas: int("Desired number of replicas, from 0 to 50."),
    namespace: NAMESPACE,
  },
  ["deployment", "replicas"],
);
export const kubeLogs = tool(
  "kube.get_pod_logs",
  "Fetch the most recent log lines of one pod's container, optionally from its previous crashed run.",
  {
    pod: str("Full pod name, exactly as listed, e.g. 'checkout-api-7d9f8-x2kqp'."),
    namespace: NAMESPACE,
    tail_lines: int("Number of lines to return, counted from the end of the log.", 100),
    previous: bool("Read the log of the previous, terminated container instance.", false),
  },
  ["pod"],
);
export const kubeRestart = tool(
  "kube.restart_deployment",
  "Restart every pod of a Kubernetes deployment with a rolling restart, keeping the replica count.",
  {
    deployment: str("Name of the deployment, exactly as given, e.g. 'checkout-api'."),
    namespace: NAMESPACE,
  },
  ["deployment"],
);
export const kubeListPods = tool(
  "kube.list_pods",
  "List the pods in a namespace with their status, restart counts and owning deployment.",
  {
    namespace: NAMESPACE,
    status: str("Only list pods in this phase.", {
      enum: ["Running", "Pending", "Failed", "Succeeded"],
    }),
    labels: obj(
      "Only list pods carrying all of these labels.",
      {
        app: str("Value of the pod's 'app' label."),
        tier: str("Value of the pod's 'tier' label."),
      },
      [],
    ),
  },
  [],
);

// ── user admin (camelCase) ──────────────────────────────────────────────────
export const getUserById = tool(
  "getUserById",
  "Fetch one user account of the admin console by its numeric id, with profile and role.",
  { userId: int("Numeric user id, e.g. 48213.") },
  ["userId"],
);
export const getUserByEmail = tool(
  "getUserByEmail",
  "Fetch one user account of the admin console by the email address it is registered under.",
  { email: str("Email address of the account, exactly as given.") },
  ["email"],
);
export const searchUsers = tool(
  "searchUsers",
  "Search user accounts by name or part of a name and return their ids, emails and roles.",
  {
    query: str("Name or part of a name to search for, case-insensitive."),
    limit: int("Maximum number of accounts to return.", 10),
    includeInactive: bool("Also return deactivated accounts.", false),
    roles: arr(
      "Only return accounts holding one of these roles, in any order.",
      str("Role.", { enum: ["viewer", "editor", "admin"] }),
    ),
  },
  ["query"],
);
export const updateUserRole = tool(
  "updateUserRole",
  "Change the role of one user account, which sets what the user can see and edit in the workspace.",
  {
    userId: int("Numeric user id, e.g. 48213."),
    role: str("New role for the account.", { enum: ["viewer", "editor", "admin"] }),
    notifyUser: bool("Email the user about the change.", true),
  },
  ["userId", "role"],
);
export const resetPassword = tool(
  "resetPassword",
  "Invalidate a user's password and email them a single-use link to choose a new one.",
  { userId: int("Numeric user id, e.g. 48213.") },
  ["userId"],
);

// ── fitness (Schema-Guided-Dialogue style) ──────────────────────────────────
export const logWorkout = tool(
  "Fitness_1_LogWorkout",
  "Log a completed workout to the user's training diary, with distance, time and heart rate.",
  {
    activity: str("Kind of workout.", { enum: ["running", "cycling", "swimming", "rowing"] }),
    distance_km: num("Distance covered, in kilometres, e.g. 10.5."),
    duration_minutes: int("Duration of the workout in whole minutes."),
    heart_rate: obj(
      "Heart rate during the workout, in beats per minute.",
      { avg: int("Average beats per minute."), max: int("Maximum beats per minute.") },
      ["avg", "max"],
    ),
    indoor: bool("The workout was done indoors, e.g. on a treadmill or trainer.", false),
  },
  ["activity", "distance_km", "duration_minutes"],
);
export const workoutHistory = tool(
  "Fitness_1_GetWorkoutHistory",
  "List the workouts in the user's training diary over a recent period, newest first.",
  {
    days: int("How many days back to list, counting today."),
    activity: str("Only list this kind of workout.", {
      enum: ["running", "cycling", "swimming", "rowing"],
    }),
    include_heart_rate: bool("Include the heart-rate summary of each workout.", false),
  },
  ["days"],
);

/** Every hand-written tool, by domain. */
export const HAND: CatalogTool[] = (
  [
    ["weather", [getCurrentWeather, getWeatherForecast, getHistoricalWeather]],
    ["travel", [flightSearch, flightStatus, flightCancel, flightReserve]],
    ["calendar", [calCreate, calList, calDelete]],
    ["messaging", [sendEmail, scheduleEmail, saveDraft]],
    ["files", [listFiles, getFileInfo, deleteFile, moveFile, searchFiles, compressFiles]],
    [
      "commerce",
      [
        orderStatus,
        trackPackage,
        cancelOrder,
        createShipment,
        shippingQuote,
        adjustInventory,
        setStockLevel,
      ],
    ],
    ["finance", [bankBalance, bankTransfer, bankTransactions, convertCurrency, exchangeRate]],
    ["home", [setThermostat, setLights, deviceStatus]],
    ["devops", [kubeScale, kubeLogs, kubeRestart, kubeListPods]],
    ["accounts", [getUserById, getUserByEmail, searchUsers, updateUserRole, resetPassword]],
    ["health", [logWorkout, workoutHistory]],
  ] as [Domain, Tool[]][]
).flatMap(([domain, tools]) => tools.map((t) => ({ tool: t, domain })));

/** General-purpose tools (web search, raw HTTP) that could serve almost any request: never filler. */
const GENERIC = new Set(["duck_duck_go.search", "sendHttpRequest"]);

/** Vendored BFCL live schemas (Apache-2.0; see NOTICE), minus general-purpose tools. */
export const VENDORED: CatalogTool[] = (
  JSON.parse(
    readFileSync(new URL("./toolcall-vendored.json", import.meta.url), "utf8"),
  ) as CatalogTool[]
).filter((v) => !GENERIC.has(v.tool.name));

// ── Ops: target tools with request templates ────────────────────────────────

/**
 * A tool a generator calls. `draw` returns the arguments a request states:
 * every required one, plus optionals at non-default values. `say` renders
 * the request in English and optionally other languages, stating every
 * value verbatim. `siblings` are the same API's near-duplicate tools.
 */
export interface Op {
  tool: Tool;
  domain: Domain;
  siblings: Tool[];
  draw: (rng: Rng) => Args;
  say: { en: (a: Args) => string } & Partial<Record<Exclude<Lang, "en">, (a: Args) => string>>;
}

/** Each optional with probability `p`, drawn by its function. */
const maybe = (rng: Rng, p: number, opts: Record<string, (rng: Rng) => unknown>): Args =>
  Object.fromEntries(
    Object.entries(opts).flatMap(([k, f]) => (rng.chance(p) ? [[k, f(rng)]] : [])),
  );

export const OPS = {
  forecast: {
    tool: getWeatherForecast,
    domain: "weather",
    siblings: [getCurrentWeather, getHistoricalWeather],
    draw: (rng) => ({
      location: rng.pick(CITIES),
      days: rng.int(2, 10),
      ...maybe(rng, 0.4, { units: () => "fahrenheit", hourly: () => true }),
    }),
    say: {
      en: (a) =>
        `What will the weather be like in ${a["location"]} over the next ${a["days"]} days?` +
        when(a, "hourly", () => " Give me hour-by-hour values.") +
        when(a, "units", () => " Use fahrenheit."),
      es: (a) =>
        `¿Qué tiempo hará en ${a["location"]} durante los próximos ${a["days"]} días?` +
        when(a, "hourly", () => " Quiero los valores hora por hora.") +
        when(a, "units", () => " En fahrenheit, por favor."),
    },
  },
  current: {
    tool: getCurrentWeather,
    domain: "weather",
    siblings: [getWeatherForecast, getHistoricalWeather],
    draw: (rng) => ({
      location: rng.pick(CITIES),
      ...maybe(rng, 0.4, { units: () => "fahrenheit", include_air_quality: () => true }),
    }),
    say: {
      en: (a) =>
        `Is it raining in ${a["location"]} right now?` +
        when(a, "include_air_quality", () => " And how is the air quality there?") +
        when(a, "units", () => " Temperatures in fahrenheit please."),
      fr: (a) =>
        `Est-ce qu'il pleut à ${a["location"]} en ce moment ?` +
        when(a, "include_air_quality", () => " Et quelle est la qualité de l'air ?") +
        when(a, "units", () => " Les températures en fahrenheit, s'il vous plaît."),
    },
  },
  flightSearch: {
    tool: flightSearch,
    domain: "travel",
    siblings: [flightStatus, flightCancel],
    draw: (rng) => {
      const [o, d] = rng.sample(AIRPORTS, 2);
      return {
        origin_airport: o,
        destination_airport: d,
        departure_date: isoDate(rng),
        ...maybe(rng, 0.35, {
          number_of_tickets: (r) => r.int(2, 5),
          seating_class: (r) => r.pick(["Premium Economy", "Business", "First"]),
          nonstop_only: () => true,
        }),
      };
    },
    say: {
      en: (a) =>
        `Find me ${when(a, "nonstop_only", () => "nonstop ")}flights from ${a["origin_airport"]} to ${a["destination_airport"]} on ${a["departure_date"]}` +
        when(a, "number_of_tickets", (n: number) => ` for ${n} people`) +
        when(a, "seating_class", (c: string) => `, ${c} class`) +
        ".",
      de: (a) =>
        `Such mir ${when(a, "nonstop_only", () => "Nonstop-")}Flüge von ${a["origin_airport"]} nach ${a["destination_airport"]} am ${a["departure_date"]}` +
        when(a, "number_of_tickets", (n: number) => ` für ${n} Personen`) +
        when(a, "seating_class", (c: string) => `, Klasse ${c}`) +
        ".",
    },
  },
  flightStatus: {
    tool: flightStatus,
    domain: "travel",
    siblings: [flightSearch, flightCancel],
    draw: (rng) => ({
      flight_number: `${rng.pick(["BA", "LH", "AF", "KL", "JL", "QF"])}${rng.int(10, 999)}`,
      date: isoDate(rng),
    }),
    say: {
      en: (a) =>
        `Is my flight ${a["flight_number"]} on ${a["date"]} on time? Which gate does it leave from?`,
      es: (a) =>
        `¿Mi vuelo ${a["flight_number"]} del ${a["date"]} sale a tiempo? ¿De qué puerta sale?`,
    },
  },
  createEvent: {
    tool: calCreate,
    domain: "calendar",
    siblings: [calList, calDelete],
    draw: (rng) => ({
      title: rng.pick([
        "Design review",
        "1:1 with Priya",
        "Vendor call",
        "Sprint planning",
        "Budget sync",
      ]),
      start: `${isoDate(rng)}T${hhmm(rng)}`,
      ...maybe(rng, 0.35, {
        duration_minutes: (r) => r.pick([45, 60, 90]),
        attendees: (r) => r.sample(EMAILS, r.int(1, 3)),
        location: (r) => r.pick(["Cedar-4", "Harbor View", "Atlas 3B"]),
        reminder_minutes: (r) => r.pick([5, 15, 60]),
        visibility: () => "private",
      }),
    }),
    say: {
      en: (a) =>
        `Put "${a["title"]}" on my calendar at ${a["start"]}` +
        when(a, "duration_minutes", (n: number) => `, lasting ${n} minutes`) +
        when(a, "location", (l: string) => `, in ${l}`) +
        when(a, "attendees", (xs: string[]) => `, and invite ${list(xs)}`) +
        when(a, "reminder_minutes", (n: number) => `. Remind me ${n} minutes before`) +
        when(a, "visibility", () => `. Keep it private`) +
        ".",
    },
  },
  listEvents: {
    tool: calList,
    domain: "calendar",
    siblings: [calCreate, calDelete],
    draw: (rng) => ({
      date: isoDate(rng),
      ...maybe(rng, 0.35, {
        include_declined: () => true,
        calendar_id: (r) => r.pick(["team-ops", "family"]),
      }),
    }),
    say: {
      en: (a) =>
        `What's on ${has(a, "calendar_id") ? `the ${a["calendar_id"]} calendar` : "my calendar"} on ${a["date"]}?` +
        when(a, "include_declined", () => " Include the ones I declined."),
      fr: (a) =>
        `Qu'est-ce qu'il y a ${has(a, "calendar_id") ? `dans le calendrier ${a["calendar_id"]}` : "dans mon agenda"} le ${a["date"]} ?` +
        when(a, "include_declined", () => " Avec ceux que j'ai refusés."),
    },
  },
  sendEmail: {
    tool: sendEmail,
    domain: "messaging",
    siblings: [scheduleEmail, saveDraft],
    draw: (rng) => {
      const [subject, body] = rng.pick(SUBJECTS);
      return {
        to: rng.sample(EMAILS, rng.int(1, 2)),
        subject,
        body,
        ...maybe(rng, 0.35, {
          cc: (r) => r.sample(EMAILS.slice(3), 1),
          priority: (r) => r.pick(["low", "high"]),
        }),
      };
    },
    say: {
      en: (a) =>
        `Email ${list(a["to"] as string[])} right now with the subject "${a["subject"]}" and the message "${a["body"]}"` +
        when(a, "cc", (xs: string[]) => `, copying ${list(xs)}`) +
        when(a, "priority", (p: string) => `. Flag it as ${p} priority`) +
        ".",
    },
  },
  scheduleEmail: {
    tool: scheduleEmail,
    domain: "messaging",
    siblings: [sendEmail, saveDraft],
    draw: (rng) => {
      const [subject, body] = rng.pick(SUBJECTS);
      return {
        to: rng.sample(EMAILS, rng.int(1, 2)),
        subject,
        body,
        send_at: `${isoDate(rng)}T${hhmm(rng)}`,
      };
    },
    say: {
      en: (a) =>
        `Write to ${list(a["to"] as string[])} with the subject "${a["subject"]}" and the message "${a["body"]}", but hold it until ${a["send_at"]}.`,
    },
  },
  listFiles: {
    tool: listFiles,
    domain: "files",
    siblings: [getFileInfo, searchFiles],
    draw: (rng) => ({
      path: rng.pick(["/var/log", "/home/dev/projects", "/srv/uploads", "/etc/nginx"]),
      ...maybe(rng, 0.4, {
        recursive: () => true,
        includeHidden: () => true,
        sortBy: (r) => r.pick(["size", "modified"]),
        limit: (r) => r.int(5, 50),
      }),
    }),
    say: {
      en: (a) =>
        `List what's in ${a["path"]}` +
        when(a, "recursive", () => ", including everything in its subdirectories") +
        when(a, "includeHidden", () => ", with hidden dotfiles shown too") +
        when(
          a,
          "sortBy",
          (s: string) => `, sorted by ${s === "size" ? "size" : "last modified time"}`,
        ) +
        when(a, "limit", (n: number) => `, showing at most ${n} entries`) +
        ".",
      de: (a) =>
        `Zeig mir den Inhalt von ${a["path"]}` +
        when(a, "recursive", () => ", inklusive aller Unterverzeichnisse") +
        when(a, "includeHidden", () => ", auch versteckte Dateien") +
        when(
          a,
          "sortBy",
          (s: string) => `, sortiert nach ${s === "size" ? "Größe" : "Änderungszeit"}`,
        ) +
        when(a, "limit", (n: number) => `, höchstens ${n} Einträge`) +
        ".",
    },
  },
  moveFile: {
    tool: moveFile,
    domain: "files",
    siblings: [getFileInfo, deleteFile, searchFiles],
    draw: (rng) => {
      const f = rng.pick(["q3-report.pdf", "invoice-0412.csv", "backup.tar.gz", "notes.md"]);
      return {
        sourcePath: `${rng.pick(["/srv/inbox", "/home/dev/Downloads"])}/${f}`,
        destinationPath: `${rng.pick(["/srv/archive", "/mnt/shared/finance"])}/${f}`,
        ...maybe(rng, 0.35, { overwrite: () => true }),
      };
    },
    say: {
      en: (a) =>
        `Move ${a["sourcePath"]} to ${a["destinationPath"]}` +
        when(a, "overwrite", () => ", replacing whatever is already there") +
        ".",
      es: (a) =>
        `Mueve ${a["sourcePath"]} a ${a["destinationPath"]}` +
        when(a, "overwrite", () => ", reemplazando lo que ya haya allí") +
        ".",
    },
  },
  trackPackage: {
    tool: trackPackage,
    domain: "commerce",
    siblings: [orderStatus, cancelOrder],
    draw: (rng) => ({
      carrier: rng.pick(CARRIERS),
      tracking_number: `${rng.int(1, 9)}${digits(rng, 11)}`,
    }),
    say: {
      en: (a) =>
        `Where is my parcel? It's with ${String(a["carrier"]).toUpperCase()}, tracking number ${a["tracking_number"]}.`,
      de: (a) =>
        `Wo ist mein Paket? Es ist bei ${String(a["carrier"]).toUpperCase()}, Sendungsnummer ${a["tracking_number"]}.`,
    },
  },
  cancelOrder: {
    tool: cancelOrder,
    domain: "commerce",
    siblings: [orderStatus, trackPackage],
    draw: (rng) => ({
      order_id: orderId(rng),
      reason: rng.pick(["changed_mind", "found_cheaper", "ordered_by_mistake", "arrives_too_late"]),
      ...maybe(rng, 0.35, { refund_method: () => "store_credit" }),
    }),
    say: {
      en: (a) =>
        `Please cancel order ${a["order_id"]}. Reason: ${String(a["reason"]).replaceAll("_", " ")}.` +
        when(a, "refund_method", () => " Refund it as store credit."),
    },
  },
  shipment: {
    tool: createShipment,
    domain: "commerce",
    siblings: [shippingQuote],
    draw: (rng) => {
      const [code] = rng.pick(COUNTRIES);
      return {
        recipient: {
          name: rng.pick(PEOPLE),
          street: rng.pick(["14 Elm Row", "220 Harbour Road", "7 Mill Lane", "93 Kestrel Way"]),
          postal_code: `0${rng.int(1000, 9999)}`,
          country: code,
        },
        weight_kg: rng.int(5, 250) / 10,
        items: rng.sample(["004417", "009302", "001876", "007731"], rng.int(1, 2)).map((sku) => ({
          sku,
          quantity: rng.int(1, 9),
        })),
        ...maybe(rng, 0.4, {
          service: (r) => r.pick(["express", "overnight"]),
          signature_required: () => true,
        }),
      };
    },
    say: {
      en: (a) => {
        const r = a["recipient"] as Record<string, string>;
        const country = (COUNTRIES.find(([c]) => c === r["country"]) as [string, string])[1];
        const items = a["items"] as { sku: string; quantity: number }[];
        return (
          `Ship a ${a["weight_kg"]} kg parcel to ${r["name"]}, ${r["street"]}, ${r["postal_code"]}, ${country} (${r["country"]}). ` +
          `It holds ${list(items.map((i) => `${i.quantity} of SKU ${i.sku}`))}.` +
          when(a, "service", (s: string) => ` Send it ${s}.`) +
          when(a, "signature_required", () => " Someone has to sign for it.")
        );
      },
    },
  },
  inventory: {
    tool: adjustInventory,
    domain: "commerce",
    siblings: [setStockLevel],
    draw: (rng) => {
      const reason = rng.pick(["sale", "return", "damage", "restock"]);
      const n = rng.int(2, 40);
      return {
        sku: `00${rng.int(1000, 9999)}`,
        delta: reason === "sale" || reason === "damage" ? -n : n,
        reason,
        ...maybe(rng, 0.45, {
          tags: (r) => r.sample(["warehouse-b", "q4", "audit", "online", "pos"], 2),
          warehouse: (r) => r.pick(["EAST-2", "RTM-1"]),
        }),
      };
    },
    say: {
      en: (a) => {
        const d = a["delta"] as number;
        return (
          `Record a stock change of ${d > 0 ? `+${d}` : d} units on SKU ${a["sku"]}, reason: ${a["reason"]}` +
          when(a, "warehouse", (w: string) => `, in warehouse ${w}`) +
          "." +
          when(a, "tags", (xs: string[]) => ` Tag it ${list(xs.map((t) => `"${t}"`))}.`)
        );
      },
    },
  },
  transfer: {
    tool: bankTransfer,
    domain: "finance",
    siblings: [bankBalance, bankTransactions],
    draw: (rng) => ({
      amount: rng.int(1000, 90000) / 100,
      recipient_account: `${rng.pick(["DE", "NL", "FR"])}${rng.int(10, 99)}${digits(rng, 16)}`,
      ...maybe(rng, 0.4, {
        account_type: () => "savings",
        memo: (r) => r.pick(["Rent March", "Invoice 2291", "Dinner split"]),
      }),
    }),
    say: {
      en: (a) =>
        `Send ${a["amount"]} to account ${a["recipient_account"]}` +
        when(a, "account_type", () => " from my savings") +
        when(a, "memo", (m: string) => ` with the reference "${m}"`) +
        ".",
      es: (a) =>
        `Envía ${a["amount"]} a la cuenta ${a["recipient_account"]}` +
        when(a, "account_type", () => " desde mi cuenta savings") +
        when(a, "memo", (m: string) => ` con la referencia "${m}"`) +
        ".",
    },
  },
  transactions: {
    tool: bankTransactions,
    domain: "finance",
    siblings: [bankBalance, bankTransfer],
    draw: (rng) => {
      const y = rng.int(2025, 2026);
      const m = rng.int(1, 11);
      return {
        start_date: `${y}-${pad(m)}-01`,
        end_date: `${y}-${pad(m + 1)}-${pad(rng.int(1, 28))}`,
        ...maybe(rng, 0.4, { account_type: () => "savings", min_amount: (r) => r.int(5, 50) * 10 }),
      };
    },
    say: {
      en: (a) =>
        `Show me the ${when(a, "account_type", () => "savings ")}transactions between ${a["start_date"]} and ${a["end_date"]}` +
        when(a, "min_amount", (n: number) => `, only those of ${n} or more`) +
        ".",
      fr: (a) =>
        `Montre-moi les opérations ${when(a, "account_type", () => "du compte savings ")}entre le ${a["start_date"]} et le ${a["end_date"]}` +
        when(a, "min_amount", (n: number) => `, seulement celles de ${n} ou plus`) +
        ".",
    },
  },
  convert: {
    tool: convertCurrency,
    domain: "finance",
    siblings: [exchangeRate],
    draw: (rng) => {
      const [f, t] = rng.sample(CODES, 2);
      return { amount: rng.int(1000, 500000) / 100, from_currency: f, to_currency: t };
    },
    say: {
      en: (a) => `How much is ${a["amount"]} ${a["from_currency"]} in ${a["to_currency"]}?`,
      de: (a) => `Wie viel sind ${a["amount"]} ${a["from_currency"]} in ${a["to_currency"]}?`,
    },
  },
  thermostat: {
    tool: setThermostat,
    domain: "home",
    siblings: [setLights, deviceStatus],
    draw: (rng) => ({
      zone: rng.pick(ZONES),
      target_temp_c: rng.int(170, 250) / 10,
      ...maybe(rng, 0.4, { mode: (r) => r.pick(["heat", "cool"]), hold_until: (r) => hhmm(r) }),
    }),
    say: {
      en: (a) =>
        `Set the ${String(a["zone"]).replace("_", " ")} thermostat (zone ${a["zone"]}) to ${a["target_temp_c"]} degrees` +
        when(a, "mode", (m: string) => ` in ${m} mode`) +
        when(a, "hold_until", (t: string) => ` and hold it until ${t}`) +
        ".",
      es: (a) =>
        `Pon el termostato de la zona ${a["zone"]} a ${a["target_temp_c"]} grados` +
        when(a, "mode", (m: string) => ` en modo ${m}`) +
        when(a, "hold_until", (t: string) => ` y mantenlo hasta las ${t}`) +
        ".",
    },
  },
  lights: {
    tool: setLights,
    domain: "home",
    siblings: [setThermostat, deviceStatus],
    draw: (rng) => {
      const on = rng.chance(0.6);
      return {
        room: rng.pick(ZONES),
        on,
        ...(on ? maybe(rng, 0.5, { brightness_pct: (r) => r.int(2, 9) * 10 }) : {}),
      };
    },
    say: {
      en: (a) =>
        a["on"]
          ? `Turn on the lights in the ${a["room"]}${when(a, "brightness_pct", (n: number) => ` at ${n} percent`)}.`
          : `Switch off the ${a["room"]} lights.`,
      fr: (a) =>
        a["on"]
          ? `Allume la lumière dans la pièce ${a["room"]}${when(a, "brightness_pct", (n: number) => ` à ${n} pour cent`)}.`
          : `Éteins la lumière dans la pièce ${a["room"]}.`,
    },
  },
  scale: {
    tool: kubeScale,
    domain: "devops",
    siblings: [kubeRestart, kubeLogs],
    draw: (rng) => ({
      deployment: rng.pick(["checkout-api", "search-indexer", "billing-worker", "web-frontend"]),
      replicas: rng.int(2, 24),
      ...maybe(rng, 0.5, { namespace: (r) => r.pick(["prod", "staging", "payments"]) }),
    }),
    say: {
      en: (a) =>
        `Scale ${a["deployment"]}${when(a, "namespace", (n: string) => ` in the ${n} namespace`)} to ${a["replicas"]} replicas.`,
    },
  },
  podLogs: {
    tool: kubeLogs,
    domain: "devops",
    siblings: [kubeRestart, kubeScale],
    draw: (rng) => ({
      pod: `${rng.pick(["checkout-api", "search-indexer", "billing-worker"])}-${digits(rng, 4)}-x${rng.int(10, 99)}q`,
      ...maybe(rng, 0.45, {
        namespace: (r) => r.pick(["prod", "staging"]),
        tail_lines: (r) => r.pick([20, 50, 500]),
        previous: () => true,
      }),
    }),
    say: {
      en: (a) =>
        `Show me ${when(a, "tail_lines", (n: number) => `the last ${n} `)}log lines of pod ${a["pod"]}` +
        when(a, "namespace", (n: string) => ` in namespace ${n}`) +
        when(a, "previous", () => ", from the run before it crashed") +
        ".",
    },
  },
  role: {
    tool: updateUserRole,
    domain: "accounts",
    siblings: [getUserById, searchUsers],
    draw: (rng) => ({
      userId: rng.int(10000, 99999),
      role: rng.pick(["viewer", "editor", "admin"]),
      ...maybe(rng, 0.4, { notifyUser: () => false }),
    }),
    say: {
      en: (a) =>
        `Make user ${a["userId"]} ${a["role"] === "viewer" ? "a" : "an"} ${a["role"]}` +
        when(a, "notifyUser", () => ", and don't email them about it") +
        ".",
    },
  },
  searchUsers: {
    tool: searchUsers,
    domain: "accounts",
    siblings: [getUserById, getUserByEmail],
    draw: (rng) => ({
      query: rng.pick(["Okafor", "Lindqvist", "Tanaka", "Moreau", "Haddad"]),
      ...maybe(rng, 0.4, { limit: (r) => r.pick([3, 5, 25]), includeInactive: () => true }),
    }),
    say: {
      en: (a) =>
        `Find ${when(a, "limit", (n: number) => `up to ${n} `)}users named ${a["query"]}` +
        when(a, "includeInactive", () => ", deactivated accounts included") +
        ".",
      es: (a) =>
        `Busca ${when(a, "limit", (n: number) => `hasta ${n} `)}usuarios que se llamen ${a["query"]}` +
        when(a, "includeInactive", () => ", incluidas las cuentas desactivadas") +
        ".",
    },
  },
  workout: {
    tool: logWorkout,
    domain: "health",
    siblings: [workoutHistory],
    draw: (rng) => {
      const avg = rng.int(115, 160);
      return {
        activity: rng.pick(["running", "cycling", "swimming", "rowing"]),
        distance_km: rng.int(15, 600) / 10,
        duration_minutes: rng.int(20, 150),
        ...maybe(rng, 0.5, {
          heart_rate: (r) => ({ avg, max: avg + r.int(10, 30) }),
          indoor: () => true,
        }),
      };
    },
    say: {
      en: (a) => {
        const hr = a["heart_rate"] as { avg: number; max: number } | undefined;
        return (
          `Log my ${a["activity"]} session${when(a, "indoor", () => " (indoors)")}: ${a["distance_km"]} km in ${a["duration_minutes"]} minutes.` +
          (hr === undefined
            ? ""
            : ` Heart rate averaged ${hr.avg} bpm and peaked at ${hr.max} bpm.`)
        );
      },
    },
  },
} satisfies Record<string, Op>;
export type OpId = keyof typeof OPS;

const SUBJECTS: readonly [string, string][] = [
  ["Q3 budget review", "Please bring your revised numbers to Thursday's review."],
  ["Lab access", "Your badge now opens the second-floor lab."],
  ["Offsite agenda", "The agenda for the offsite is attached; comments by Friday please."],
  ["Invoice 2291", "The invoice is paid; the receipt is in the shared folder."],
];
