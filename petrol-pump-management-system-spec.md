# Petrol Pump Management System — Product Specification Document

**Version:** 4.0
**Date:** 7 April 2026
**Status:** Updated to reflect dynamic shift definitions (PumpShiftDefinition replacing fixed ShiftWindow enum), Accountant role, expense tracking module, payroll module, ancillary products module, nozzle calibration logging, shift planning system, in-app notification system, and credit customer self-service portal

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Roles & Access Control](#2-roles--access-control)
3. [Core Entities](#3-core-entities)
4. [System Flows](#4-system-flows)
5. [Business Rules](#5-business-rules)
6. [Edge Cases & System Guardrails](#6-edge-cases--system-guardrails)
7. [Reporting Specification](#7-reporting-specification)
8. [Future Enhancements](#8-future-enhancements)
9. [Open Questions](#9-open-questions)

---

## 1. Executive Summary

### What Is This System?

The Petrol Pump Management System (PPMS) is a backend-first digital platform designed to help petrol pump owners and managers run their operations with full accountability, visibility, and control. It replaces manual registers, paper-based shift handovers, and ad-hoc credit ledgers with a structured, auditable digital system.

The system is built to be consumed by two client applications: a web application used by managers and owners on desktops, and a mobile application used by nozzle operators in the field and by owners who need access on the go.

### Who Does It Serve?

PPMS serves four types of users operating at different levels of a petrol pump business:

- **The Owner** is typically a business owner who may run one or more petrol pump locations. They need a bird's-eye view of all operations — daily revenue, fuel inventory, credit outstanding, and profitability — without needing to be physically present at each pump. The owner is also the final authority on corrections, configuration, and credit policy.

- **The Admin** is a senior, trusted staff member at a specific pump — think of them as a senior manager with additional system privileges. They handle all day-to-day operations a manager does, plus they can perform manual stock corrections, confirm large DIP variances, and assist the owner with amendments. There is at most one admin per pump.

- **The Manager** is the on-ground person responsible for day-to-day shift operations at a specific pump location. They open and close shifts, maintain the current global fuel sell price, log tanker deliveries, handle credit customers, and ensure accurate cash collection at every handover. Scoped strictly to one pump.

- **The Nozzle Operator** is the frontline employee who dispenses fuel at a specific nozzle unit during their shift. They account for all cash and digital payments collected during their shift and can log credit sales. Their system access is limited to their currently active shift only.

### What Problem Does It Solve?

Running a petrol pump involves a surprisingly high volume of manual accountability. At the end of every 8-hour shift, a manager must reconcile how many litres were dispensed by each nozzle, at what price, how much cash was collected, how many digital payments came in, and how much was given on credit. Doing this manually — with notebooks, calculators, and WhatsApp messages — creates gaps: missing records, incorrect handovers, unresolved discrepancies, credit customers slipping through without paying, and no reliable way to track profitability against fuel purchase costs.

PPMS solves this by:

- Creating a structured digital shift lifecycle — every shift is opened with meter readings and closed with full payment reconciliation.
- Locking fuel sell prices at shift start — when a shift opens, the current Global Fuel Sell Price is automatically captured and permanently snapshotted. Prices are maintained centrally by the manager; no manual entry is required at each shift open, eliminating per-shift pricing errors.
- Tracking credit customers with real-time balance monitoring, overdue blocking, and billing cycle management.
- Logging every tanker delivery with its cost price to enable accurate FIFO-based cost-of-goods-sold calculations per shift.
- Performing daily DIP-based physical stock reconciliation per underground tank to keep system inventory aligned with physical reality.
- Generating shift-level, daily, and custom-range reports so the owner and manager always have an accurate financial picture.
- Enforcing business rules automatically — duplicate credit bills are rejected, discrepancies cannot be silently ignored, and inventory lots are consumed in correct FIFO order.

### What It Is Not (v1 Scope)

The core system is a backend operations and reporting platform. As of Version 4.0, it now also includes: expense tracking and approval, shift-based payroll generation, ancillary (counter) product inventory and sales, nozzle calibration compliance logging, weekly shift planning with staff preferences and leave management, an in-app notification system, and a public credit balance portal for customers.

It does not include operator self-login with liveness checks, POS terminal integrations, automated SMS/WhatsApp billing, or full P&L with operating expenses. These remain planned for future phases and are documented in the Future Enhancements section.

---

## 2. Roles & Access Control

### Role Overview

The system has **five roles**. Every person in the system — regardless of role — has a unified employee profile (Section 3.0): Employee ID, Name, Phone Number, Address.

| Capability | Owner | Admin | Manager | Nozzle Operator | Accountant |
|---|---|---|---|---|---|
| Access all pump locations | Yes | No — assigned pump only | No — assigned pump only | No — active shift only | No — assigned pump only |
| View all reports (all pumps) | Yes | No — own pump only | No — own pump only | No | No — own pump only |
| Manage pump & nozzle configuration (incl. max nozzle count, fuel outlets) | Yes | No | No | No | No |
| Create/manage user accounts | Yes | No | No | No | No |
| Set credit customer interest rate | Yes (owner only) | No | No | No | No |
| Set credit customer credit limit (permanent) | Yes (owner only) | No | No | No | No |
| Grant temporary credit limit extension or billing cycle extension | Yes | Yes (own pump only) | No | No | No |
| Open a shift (assign operator to nozzle) | No | Yes | Yes | No | No |
| Close a shift / record end readings | No | Yes | Yes | No | No |
| Submit payment breakdown at handover | No | Yes (on behalf) | Yes (on behalf) | Yes (self-service) | No |
| Log credit sales during a shift | No | Yes | Yes | Yes (own active shift only) | No |
| Create/manage credit customer profiles | Yes | Yes | Yes | No | No |
| Link a credit customer to a pump | Yes | Yes (own pump only) | No | No | No |
| Log credit customer payments | No | Yes | Yes | No | No |
| Generate credit statements | No | Yes | Yes | No | No |
| Update Global Fuel Sell Price (per fuel type) | Yes | Yes | Yes | No | No |
| Log tanker fuel deliveries | No | Yes | Yes | No | No |
| View profit/loss reports | Yes | Yes — own pump | Yes — own pump | No | Yes — own pump (read-only) |
| View operator duty / short-sell reports | Yes | Yes — own pump | Yes — own pump | No | Yes — own pump (read-only) |
| View balance sheets and financial reports | Yes | Yes — own pump | Yes — own pump | No | Yes — own pump (read-only) |
| View expenses | Yes | Yes | Yes | No | Yes — own pump (read-only) |
| Create/submit expenses | No | Yes | Yes | No | No |
| Approve/reject expenses | Yes | Yes (own pump only, above threshold) | No | No | No |
| Generate/view payroll records | Yes | Yes | Yes | No | Yes — own pump (read-only) |
| Approve payroll records | Yes | Yes | No | No | No |
| Mark nozzle as inactive/offline | No | Yes | Yes | No | No |
| Acknowledge shift discrepancies & set resolution action | No | Yes | Yes | No | No |
| Approve credit limit override | No | Yes | Yes | No | No |
| Log planned meter reset event | Yes (owner only) | No | No | No | No |
| Deactivate/terminate an operator or manager | Yes (owner only) | No | No | No | No |
| View inventory lot report | Yes | Yes | Yes | No | Yes — read-only |
| Configure underground tanks (add/edit/decommission) | Yes (owner only) | No | No | No | No |
| Disable / enable underground tank (maintenance) | Yes | Yes | No | No | No |
| Record daily DIP measurement | Yes | Yes | Yes | No | No |
| Confirm DIP variance above tolerance threshold | Yes | Yes | No | No | No |
| Perform post-close meter reading correction | Yes (owner only) | No | No | No | No |
| Override overdue billing cycle block for credit customer | Yes | Yes (own pump only) | No | No | No |
| Log nozzle calibration events | Yes | Yes | Yes | No | No |
| View nozzle calibration history | Yes | Yes | Yes | No | No |
| Create/manage shift plans | No | Yes | Yes | No | No |
| Manage ancillary products and stock | No | Yes | Yes | No | No |
| Record ancillary sales | No | Yes | Yes | No | No |

**Role definitions:**
- **Owner** — the business owner. Full access to all pumps and all administrative functions. Cannot be assigned to a pump.
- **Admin** — a senior staff member at a specific pump who has all operational capabilities of a Manager, **plus the additional ability to perform manual corrections** — specifically: physical stock adjustments (Section 4.12), meter reading amendments (after owner approval), and credit interest adjustments. Think of Admin as a "senior manager with correction authority." A Manager cannot perform these corrections; only Admin and Owner can. Scoped to one pump.
- **Manager** — responsible for day-to-day shift operations at a pump. Opens and closes shifts, handles handovers, logs deliveries, submits and manages expenses. Scoped to one pump.
- **Nozzle Operator** — frontline fuel dispenser. Logs credit sales during their active shift and submits payment breakdown at handover. Minimal system access.
- **Accountant** — read-only access to all financial data for their assigned pump. Can view balance sheets, P&L reports, credit ledgers, expenses, payroll records, and inventory reports, but cannot create or modify any records. This role exists to give finance staff visibility without granting operational permissions. Scoped to one pump.

### Notes on Scope

- A Manager is always scoped to exactly one pump location. They cannot see data from, or take actions at, pumps they are not assigned to. One manager per pump; one pump per manager.

- A Nozzle Operator does not have a persistent dashboard. Their primary interaction is at shift handover: submitting their payment breakdown. They may also log credit sales during their active shift. **Their visibility is strictly limited to their currently active shift only — they cannot view historical shifts, past balance sheets, or any other operator's data. An operator can only have one open shift at a time — the system enforces this.**

- **Any manager assigned to a pump can close any open shift at that pump**, regardless of which manager opened the shift. This ensures operator handovers are never blocked when the original manager is unavailable.

- The Owner has read access to everything and administrative access to system-level configuration (pump locations, nozzle setup, user management). They do not typically perform day-to-day operational actions like opening shifts — that is the manager's responsibility. The Owner can update the Global Fuel Sell Price if needed but this is ordinarily done by the Admin or Manager.

---

## 3. Core Entities

This section describes the main "things" the system tracks. Think of these as the building blocks of the data model, described in plain English. These are not database table definitions — they are conceptual descriptions of what each entity represents, what information it holds, and how it relates to other entities.

---

### 3.0 User / Employee

Every person who uses or is tracked by the system — regardless of role — has a unified employee/user profile. This includes owners, admins, managers, and nozzle operators. All four roles share the same base profile fields:

- **Employee ID** — a unique identifier assigned by the system (auto-generated) or by the owner at the time of registration. Used to unambiguously identify the person in all records, reports, and audit logs.
- **Full Name**
- **Phone Number** — used as the primary contact and as the login identifier (username for authentication)
- **Password Hash** — the bcrypt (or equivalent one-way hash) of the user's login password. Plain-text passwords must never be stored. This field is set at account creation by the Owner and can be reset by the Owner. Future: replaced by OAuth token reference when OAuth migration is done (Q17).
- **Address** — residential or correspondence address
- **Role** — one of: Owner, Admin, Manager, or Nozzle Operator (see Section 2 for role definitions)
- **Status** — Active or Inactive/Terminated
- **Assigned Pump** — for Admins, Managers, and Operators: the specific pump location they are assigned to. Admins and Managers are assigned to exactly one pump. Operators are also assigned to one pump. Owners have implicit access to all pumps and are not pump-assigned.
- **Date of Joining**

Each person has exactly one role. A person cannot hold multiple roles simultaneously (e.g., a Manager cannot also work as an Operator). The four roles and their capabilities are defined in Section 2.

---

### 3.1 Owner Account

The top-level account in the system. Everything in PPMS belongs to an owner account. A single owner can operate multiple pump locations under their account. The owner has a User/Employee profile (Section 3.0) and additionally holds: business name, business registration details, and login credentials. All financial reports, inventory summaries, and credit ledgers roll up to this account.

---

### 3.2 Pump Location

A physical petrol pump site. Each pump location belongs to one owner and has a name (e.g., "Al Barsha Station"), an address, a set of nozzle units, and one or more **Underground Storage Tanks** (Section 3.13). A pump location has exactly one Manager and at most one Admin assigned to it at any time. Fuel inventory is tracked at the individual tank level — not just at the pump level. Pump locations are independent of each other — a shift at one pump has no relation to a shift at another.

**Maximum nozzle count** is configured by the owner at the time of pump setup and represents the total number of physical dispensing units at that location. This number is fixed at the time of configuration and can only be changed by the owner (e.g., if a new nozzle is physically installed). The system will not allow more shifts to be opened than there are configured nozzles at a pump.

---

### 3.3 Nozzle Unit

A physical dispensing unit at a pump location. Each nozzle unit has a number (1 through 9), a status (Active or Inactive/Under Maintenance), and one or more **Nozzle Outlets** — one per fuel type it is configured to dispense. The old fixed DUAL/CNG type model has been replaced by a flexible outlet model that supports all five fuel types.

#### Fuel Types

The system supports five fuel types across nozzles and tanks:

| Fuel Type | Display Name | Unit |
|---|---|---|
| `PETROL` | Petrol | Litres (L) |
| `SPEED_PETROL` | Speed Petrol | Litres (L) |
| `DIESEL` | Diesel | Litres (L) |
| `SPEED_DIESEL` | Speed Diesel | Litres (L) |
| `CNG` | CNG | Kilograms (kg) |

**Important:** CNG is measured and sold in **kilograms (kg)**, not litres. All CNG readings, inventory balances, and prices are expressed in kg and ₹/kg. Reports clearly label CNG quantities as "kg."

#### Nozzle Outlets

Each nozzle outlet represents one fuel type that the nozzle can dispense, with its own independent totalizer meter counter. A nozzle's dispensing capability is entirely defined by its configured outlets:

- A nozzle can have **1 to 4 non-CNG outlets** (any combination of PETROL, SPEED_PETROL, DIESEL, SPEED_DIESEL), each with its own separate electronic meter.
- A nozzle can have **exactly 1 CNG outlet** — CNG is always standalone and can never be combined with other fuel types on the same nozzle.
- A nozzle that dispenses, say, both Petrol and Speed Diesel has two outlets and two meters. A shift on that nozzle requires start and end readings for each outlet independently.

**Outlet record fields:**
- **Outlet ID** — unique identifier for this outlet
- **Nozzle reference** — which nozzle this outlet belongs to
- **Fuel type** — one of the five supported fuel types
- **Last reading** — the meter counter value at the close of the most recent shift on this outlet. Used to pre-fill the start reading when opening the next shift.

**CNG mixing rule:** CNG must never be combined with other fuel types on the same nozzle. The system enforces this at both the API and UI layers: selecting CNG clears all other outlet types, and selecting any non-CNG type clears CNG.

#### Tank Assignment

Nozzles are **not assigned to specific underground tanks**. A nozzle draws from the pump's total stock for each fuel type it dispenses. FIFO inventory deduction at shift close is scoped to the **pump + fuel type** — not per-tank. This means if a pump has three petrol tanks, FIFO deduction at shift close will consume from the oldest active petrol lot across all three tanks, in delivery-date order. See Section 3.9a and Section 3.10 for full FIFO details.

#### Nozzle Unit Record

Each nozzle unit record holds:
- **Nozzle number** — 1 through 9, unique per pump
- **Status** — Active or Inactive/Under Maintenance
- **Assigned pump** — which pump location this nozzle belongs to
- **Outlets** — the list of fuel type outlets configured for this nozzle (1–4 non-CNG, or 1 CNG)
- **Maximum meter value** — the highest value the totalizer counter reaches before rolling back to zero (e.g., 999,999.999 litres for Petrol/Diesel). Configured by the Owner per nozzle. Used by the system to calculate corrected units sold when a meter rollover is declared (see Section 6.1). This is a physical property of the nozzle hardware model — it must be entered correctly at setup.

A nozzle unit can only be assigned to one operator at any given time. If a nozzle is marked Inactive, no new shift can be started on it.

---

### 3.4 Fuel Price

There are **two completely separate fuel price concepts** in this system — they must never be confused:

**1. Global Fuel Sell Price (Outflow Price — Revenue Side)**
The current retail selling price per fuel type, maintained centrally at the pump level. This is **not entered at each individual shift** — it is a standing master record that the Admin or Manager keeps up to date whenever the retail price changes (e.g., daily price revisions by oil marketing companies).

The Global Fuel Sell Price record holds:
- **Pump reference** — which pump location this price belongs to. Global Fuel Sell Price is always pump-scoped — a price set at Pump A does not affect Pump B. This is a mandatory foreign key.
- **Fuel type** — one of the five supported types: PETROL, SPEED_PETROL, DIESEL, SPEED_DIESEL, CNG (see Section 3.3 for the full fuel type table)
- **Price per unit** (₹/litre for Petrol and Diesel, ₹/kg for CNG)
- **Effective from** (date and time the price became active)
- **Set by** (user ID and name of the Admin, Manager, or Owner who saved this record)
- The full history of past prices is retained and immutable — old records cannot be deleted or edited

When a new shift is opened, the system automatically reads the current Global Fuel Sell Price for each fuel type on that nozzle and **snapshots it permanently into the shift record**. The manager does not type a price at shift open — they see the price that will be locked and confirm. If the price needs to be changed before a shift opens, the manager/admin updates the Global Fuel Sell Price first, then opens the shift. Once a shift is open, its snapshotted price is locked for the full duration of the shift — no changes while open.

**Price continuity:** If the Admin/Manager does not update the price today, the most recently saved price remains the current price and will be snapshotted into the next shift. There is no automatic expiry. The admin only needs to update the price when the retail rate changes.

**First-time price setup:** On a brand-new pump, no Global Fuel Sell Price exists for any fuel type. The system blocks a shift from opening on any nozzle outlet that has no price on record and shows: "No price set for [Fuel Type] at this pump. Please set a Global Fuel Sell Price before opening a shift." The Admin/Manager must set a price for every fuel type dispensed by at least one nozzle before operations can begin. This is a one-time setup requirement.

The 15% deviation guard (see Section 6.12 and Business Rule 37) fires when a new Global Fuel Sell Price is saved — not at shift open — so large unintentional price changes are caught before they affect any shift.

**2. Cost Price (Inflow Price — COGS Side)**
The price paid to the fuel supplier per litre (or per kg for CNG). This is recorded when a tanker delivery is logged (see Section 3.9 and Section 4.8). It is stored in the Inventory Lot created by that delivery and is used exclusively for Cost of Goods Sold (COGS) calculations in the Profit/Loss report. The cost price is completely independent of the sell price — a shift may sell petrol at ₹103/L (sell price) while the petrol in the tank cost ₹80/L (cost price from the tanker lot).

**Why two separate entities matter:** Sell price history lives on Global Fuel Sell Price records (snapshotted into shifts at open time). Cost price history lives on tanker delivery / Inventory Lot records. They serve different purposes, are managed at different points in time, and must never be combined in calculations.

---

### 3.5 Shift

The central operational record of the system. A shift represents one operator's assignment to one nozzle for one time-bounded block of work. It is the unit of accountability.

**Shift definitions are configurable per pump.** The Owner defines one or more **Pump Shift Definitions** (Section 3.16b) for each pump location, specifying the name, start time, end time, and whether the shift is a night shift. The default setup follows three 8-hour windows that together cover 24 hours without overlap:
- **Shift 1 (Night):** 12:00 AM – 8:00 AM
- **Shift 2 (Morning):** 8:00 AM – 4:00 PM
- **Shift 3 (Evening):** 4:00 PM – 12:00 AM

However, owners may configure different window durations, names, or counts to match their operational reality. The system enforces that shift definition groups must not have overlapping windows, and that the end time of one definition cannot equal the start time of another within the same group. A shift definition marked as a **night shift** (`isNightShift = true`) affects payroll calculations — see Section 3.18.

**End-time exclusivity:** The end time of a shift definition is exclusive — a shift defined as 8:00 AM – 4:00 PM covers the period up to but not including 4:00 PM. This prevents boundary ambiguity when one shift ends and the next begins at the same clock time.

All open shifts must be closed by their scheduled shift definition end time. Unless a shift definition crosses midnight, there are no cross-midnight shifts.

A shift record holds:
- Which nozzle unit it is for
- Which operator is assigned
- **Shift definition** — which configured shift definition this shift belongs to (e.g., "Night Shift" 12AM–8AM, "Morning Shift" 8AM–4PM). Selected by the manager when opening the shift. Stored as a reference to the `PumpShiftDefinition` record (see Section 3.16b).
- The shift start date and actual start time (recorded clock time — may differ from the window's scheduled start)
- The start meter reading(s) — one per fuel type on that nozzle
- The fuel sell price(s) at the time the shift started — snapshotted and locked at the moment the shift is opened
- The shift end date and actual end time (once closed)
- The end meter reading(s) (once closed)
- The calculated units sold per fuel type (derived: end reading minus start reading)
- The calculated amount due per fuel type (derived: units sold multiplied by snapshotted sell price)
- The payment breakdown submitted at handover: cash collected, UPI collected, card collected (UPI and card are separate fields — see Section 4.2), credit total
- Any discrepancy amount and the reason provided by the manager
- **Discrepancy type:** Short (operator collected less than due) or Over (operator collected more than due)
- **Discrepancy resolution action:** Pending Investigation / Salary Deduction / Cash Recovery / Waived (set by manager after investigation)
- **Discrepancy resolution note:** Free-text explanation of how it was resolved
- **Shift status** — one of:
  - `Open` — shift is active
  - `Open — Overdue` — shift window has ended but the shift has not been closed yet
  - `Auto-Closed — Overdue` — system auto-closed the shift at the window boundary to unblock the nozzle for the next shift; end meter reading and payment breakdown are still required from the manager before the operator's record is settled (see Section 6.11)
  - `Closed — Balanced` — shift closed, payments match
  - `Closed — Discrepancy Pending` — shift closed with a discrepancy, resolution not yet finalised
  - `Closed — Discrepancy Resolved` — discrepancy fully resolved

A shift also has a list of credit sales that were logged against it during the shift duration.

---

### 3.6 Credit Customer

Credit customers exist at **two levels** simultaneously:

- **Owner level:** The customer profile (name, contact, vehicles, credit limit, interest rate, billing cycle) is created and owned at the owner account level. This means the same customer can purchase fuel at any pump location owned by the same owner — they have one shared outstanding balance and one shared credit limit across all locations.
- **Pump linking:** Before a credit customer can be used at a specific pump, they must be explicitly linked to that pump by the Admin (or Owner). The Admin navigates to the credit customer profile and assigns them to their pump. Once linked, the association is permanent — a customer cannot be unlinked from a pump, because historical transaction records are tied to this relationship.

  The pump link is a formal sub-entity — **Credit Customer–Pump Link** — with the following fields:
  - Credit customer reference
  - Pump reference
  - **Link status** — `Active` or `Suspended`. When a customer stops using a pump, the manager sets the link status to `Suspended`. This is pump-level only — it does not affect the same customer's link to other pumps. A suspended link blocks new credit sales at that pump; all historical records and the outstanding balance remain fully visible. The link status can be restored to `Active` by the Admin or Owner.
  - **Linked by** — user ID and name of the Admin or Owner who created the link
  - **Linked on** — date and time the link was created (UTC)
  - **Suspended by** / **Suspended on** — if the link has been suspended, who suspended it and when

  **Important:** Setting the global `Credit Limit` to 0 (on the owner-level profile) is a different action — it blocks new credit sales at all pumps for this customer. Pump-level suspension via the Link Status is the correct mechanism when a customer should stop purchasing at one specific pump only.
- **Per-pump visibility:** Each pump's manager can view and log credit sales for customers linked to their pump. The manager **can only see the transactions and outstanding balance from their own pump** — they have no visibility into the same customer's purchases at other pumps belonging to the same owner. The manager cannot change the customer's credit limit or interest rate — only the Owner can. The Owner sees the full aggregated balance across all pumps.

The credit customer profile holds:
- Name, contact number, and address
- One or more vehicle numbers associated with this customer
- **Billing cycle:** Weekly or Monthly — defines the period over which credit sales are billed and when overdue status is assessed. A customer whose previous billing cycle ends without full payment is blocked from new credit sales until the overdue balance is settled.
- **Credit limit:** the maximum outstanding balance this customer is allowed to carry. **Set and modified permanently by the Owner only.** Setting the credit limit to 0 effectively deactivates the customer — no new credit sales can be logged, but historical records and outstanding balances remain fully accessible.

  **Credit Limit Extension (temporary override):** When a customer has exhausted their credit limit or has been blocked due to a limit of 0 or an overdue billing cycle, the **Admin or Owner** can grant a temporary extension to allow operations to continue. This does not permanently change the credit limit — it is a time-bound or amount-bound override managed through a **Credit Extension record** (see below). The manager and operator cannot grant extensions.

  A **Credit Extension record** holds:
  - Credit customer and pump reference (extensions are pump-scoped — granting an extension at Pump A does not affect Pump B)
  - **Extension type** — one of:
    - `Amount Extension` — allows the customer to borrow an additional X amount beyond their current credit limit for a specified period. Example: credit limit is ₹10,000 and customer is at ₹9,800 — Admin grants a ₹5,000 extension for 7 days.
    - `Billing Cycle Extension` — extends the billing cycle deadline by N days, deferring the overdue block. Example: customer's billing cycle ended March 31 with ₹3,000 unpaid — Admin extends the cycle deadline to April 7 to give the customer time to pay.
    - `Overdue Block Waiver` — one-time waiver of the overdue block, allowing credit sales to resume immediately without settling the overdue balance. Highest-risk option; mandatory written justification required.
  - **Extension amount** (for Amount Extension) — the additional credit headroom granted
  - **Extension expiry date** — the date and time after which the extension automatically expires. After expiry, normal limits and blocks resume. Mandatory — extensions cannot be open-ended.
  - **Granted by** — user ID, name, role (Admin or Owner), and UTC timestamp
  - **Mandatory reason** — written justification for granting the extension (e.g., "Customer has confirmed payment by April 7," "One-time goodwill extension")
  - **Status** — `Active` (within expiry) or `Expired`

  When an active Credit Extension exists for a customer at a pump, the system applies the extended limit for sales checks and suppresses the overdue block for the duration. The extension is visible to the manager as a banner: "Credit extension active for [Customer] — expires [date]. Granted by [Admin/Owner name]."
- **Interest rate (%):** The percentage interest to be applied on outstanding balances. **Set by the Owner only.** Can be 0% (no interest charged) for some customers. Rate changes take effect from the next interest period.
- **Interest period:** Weekly or Monthly — defines how frequently interest is calculated and charged. **Set by the Owner only.** Set independently of the billing cycle — a customer can have a monthly billing cycle with weekly interest accrual.

  **Important distinction:** The billing cycle determines when overdue status is assessed and when statements are generated. The interest period determines when interest is calculated and staged for confirmation. These can be different. Example: Monthly billing cycle (statement generated monthly) with Weekly interest accrual (interest calculated every Monday).

- **Interest calculation basis:** Interest starts accruing from the **date of each individual credit sale** (not from the start of the billing cycle). The first period is pro-rated to the nearest boundary. Interest is **compound** — any unpaid interest is added to the outstanding balance before the next period's interest is calculated. Full detail in Section 3.12 and Section 4.11.

The system tracks the customer's current outstanding balance in real time across all pumps. Every credit sale (at any linked pump) adds to it; interest charges add to it at the end of each period; every payment the manager logs reduces it.

---

### 3.11 Operator Short/Over Sell Ledger

A running record of all unresolved and resolved discrepancies for each nozzle operator across all their shifts. This entity aggregates discrepancy data from the Shift records into an operator-level view.

It tracks:
- Total outstanding short amount (money the operator owes — cumulative unresolved short discrepancies)
- Total outstanding over amount (surplus collected — unusual, but tracked for audit)
- History of every discrepancy: shift date, nozzle, discrepancy amount, type (short/over), resolution action, and resolution date
- Any partial recoveries (e.g., operator paid back ₹500 of a ₹1,200 shortfall; ₹700 remains outstanding)

This is the basis for the Operator Short/Over Sell Report (Section 7.7).

---

### 3.12 Credit Interest Charge

A record of interest calculated and applied to a credit customer's outstanding balance at the end of an interest period. The interest model is **compound** — unpaid interest from previous periods is added to the base on which the next period's interest is calculated.

**How interest accrues per transaction:**
- Interest starts accruing from the **date of each individual credit sale**, not from the start of the billing cycle
- Example: Customer buys on March 5 (Wednesday). Weekly interest periods end on Monday. First period for this sale: March 5 (Wed) to March 10 (Mon) = 5 days, pro-rated. Second full period: March 10 (Mon) to March 17 (Mon) = 7 days. And so on.
- If week 1 interest (e.g., ₹15) goes unpaid, week 2 interest is calculated on (original principal + ₹15), not just the principal. This is compound interest.

**What each interest charge record holds:**
- The credit customer
- The credit sale(s) this interest relates to
- The interest period (start date to end date)
- The base amount on which interest was calculated (principal outstanding + any carried-forward unpaid interest)
- The interest rate applied (%)
- The interest amount charged for this period
- Whether the previous period's interest was paid or carried forward (determines compound base)
- Confirmation status: Staged (pending manager confirmation) or Posted (confirmed and applied to ledger)
- The date the interest was posted to the customer's ledger

**Settlement priority:** When a customer makes a payment, **strict chronological FIFO applies across all charge types** — sales and interest charges alike. Whichever charge is oldest (by date) is settled first, regardless of whether it is a principal sale or an interest charge. This is consistent with the FIFO settlement model in Section 4.6 and avoids two conflicting rules.

Interest charges appear as distinct line items in the Credit Customer Ledger alongside sales and payments, with a per-transaction interest breakdown available in the Interest Accrual Detail Report (Section 7.8).

---

### 3.13 Underground Storage Tank

A physical underground tank at a pump location. Each pump has one or more underground tanks — these are the physical containers where fuel is stored before being dispensed through nozzles. Tanks are the lowest-level unit of fuel inventory in the system.

**Tank creation:** Tanks are created manually by the owner (or admin). Unlike nozzles, tanks are not auto-created. The owner explicitly registers each physical underground tank with a name, fuel type, and capacity. Multiple tanks of the same fuel type are allowed (e.g., three petrol tanks at a high-volume pump).

Each tank holds:
- **Tank identifier** — a unique label assigned by the owner (e.g., "Petrol Tank 1", "Diesel-A", "CNG Tank"). Must be unique per pump.
- **Fuel type** — one of the five supported fuel types (PETROL, SPEED_PETROL, DIESEL, SPEED_DIESEL, CNG). A tank holds exactly one fuel type. It cannot hold mixed fuel types.
- **Capacity** — the maximum physical volume of the tank (litres for all non-CNG types; kg for CNG). Entered by the owner for reference and alert purposes.
- **Current stock** — the live calculated quantity remaining in this tank (updated on every tanker delivery and every shift close via FIFO)
- **DIP tolerance** — the acceptable variance in litres/kg between system stock and the physical DIP measurement before elevated approval is required. Default: 20 litres/kg. Set per tank by the owner.
- **Status** — `ACTIVE`, `INACTIVE`, or `DECOMMISSIONED`. See below.

#### Tank Status

| Status | Meaning |
|---|---|
| `ACTIVE` | Tank is operational. Deliveries, DIP checks, and FIFO deductions all work normally. |
| `INACTIVE` | Tank is temporarily disabled (e.g., maintenance). Stock is frozen — FIFO deduction skips this tank's lots. New deliveries and DIP checks are blocked. Can be re-enabled by Owner/Admin. |
| `DECOMMISSIONED` | Tank has been permanently removed from service. Not shown in the UI. Historical records are preserved. |

#### Disabling a Tank (INACTIVE)

When a tank is disabled:
- All inventory lots belonging to that tank are **excluded from FIFO deduction** at shift close. The stock in a disabled tank is frozen until the tank is re-enabled.
- **New tanker deliveries to the disabled tank are blocked.** The system shows: "Tank '[name]' is currently disabled. Re-enable it in Setup before recording a delivery."
- **DIP checks on the disabled tank are blocked** for the same reason.
- If the tank being disabled still holds more than 5% of its configured capacity as stock, the system warns the operator: "[X]% of stock will be frozen. Confirm?" The disable proceeds regardless — the warning is informational.
- Only **Owner or Admin** can disable or re-enable a tank.

**Stock implications of disabling:** If the only lots remaining for a particular fuel type at a pump are from a disabled tank, FIFO deduction for that fuel type at shift close will produce zero coverage — the shift will log an inventory shortage warning (see Business Rule 10) but will still close. The shortage will surface as a DIP discrepancy. Re-enabling the tank immediately restores its lots to the FIFO queue.

**Relationship to nozzles:** Nozzles are NOT assigned to specific underground tanks. Inventory deduction at shift close is scoped to pump + fuel type across all active tanks. See Section 3.9a for full FIFO details.

**Relationship to tanker deliveries:** Each tanker delivery targets a specific tank. The Inventory Lot created by that delivery is tagged with that tank's ID, allowing the system to respect the INACTIVE status during FIFO.

**DIP check:** Once per day, the manager records the physical dip measurement for each ACTIVE tank (see Section 4.12). INACTIVE tanks are skipped until re-enabled.

---

### 3.14 Meter Reading Amendment

A formal record created when a physical intervention on a nozzle's hardware requires the meter reading to be reset or adjusted. This is **not** a correction to a data entry error — it is a logged response to a physical event: a nozzle was repaired, maintained, or calibrated, and as a direct result the meter was reset to zero or adjusted to a specific value.

**Why this entity exists:** Without this record, the system would flag the next shift's start reading as anomalous (lower than the previous end reading triggers the meter rollover warning). The Meter Reading Amendment tells the system: "This discrepancy is expected and authorised — physical work was done on this nozzle."

**Only the Owner can create a Meter Reading Amendment** (see Business Rule 53). This prevents managers from silently hiding meter tampering under the guise of maintenance.

Each Meter Reading Amendment record holds:
- **Nozzle reference** — which nozzle this amendment applies to
- **Outlet / Fuel Type** — which specific outlet meter was physically worked on (e.g., "Petrol outlet", "Speed Diesel outlet", "CNG outlet"). For nozzles with a single outlet, this field is pre-populated automatically. For nozzles with multiple outlets, this field is mandatory — an amendment that does not specify which outlet meter was worked on is ambiguous and must be rejected by the system.
- **Amendment type** — one of:
  - `Meter Reset` — meter was reset to zero after hardware replacement or calibration
  - `Manual Adjustment` — meter was set to a specific non-zero value after adjustment work
- **Pre-amendment reading** — the meter value recorded immediately before the physical work (for audit trail)
- **Post-amendment reading** — the meter value immediately after the work (the new baseline for the next shift)
- **Work description** — mandatory free-text field explaining what physical work was done (e.g., "Replaced meter module — module failure, new module starts at 0", "Nozzle calibration — meter adjusted to match test rig reading of 15,200")
- **Amendment date** — the date and time the physical work was completed
- **Approved by** — Owner's user ID, name, and UTC timestamp
- **Audit note** — automatically appended to all subsequent shifts on this nozzle: "Meter amended on [date] — Owner-approved. See Amendment Record #[ID]."

**Effect on system validation:** After a Meter Reading Amendment is logged, the system accepts the next shift's start reading as the post-amendment value (even if it is lower than the previous shift's end reading) without triggering the rollover warning. The amendment record is permanently attached to the nozzle history and appears in all relevant audit views.

---

### 3.15 DIP Correction

A formal record created each time the physical DIP measurement for a tank differs from the system-calculated balance by more than the configured tolerance, and the variance is confirmed by Admin or Owner. Also created when the DIP measurement results in any adjustment (even within tolerance, a DIP Correction record is created for full audit history whenever the physical measure differs from the calculated balance).

Each DIP Correction record holds:
- **Tank reference** — which underground tank this correction applies to
- **Date** — the calendar date of the DIP check (one per tank per day maximum)
- **System-calculated balance** — the stock quantity the system had on record for this tank before the correction (litres or kg)
- **Physical DIP reading** — the quantity actually measured with the dip rod (litres or kg)
- **Difference** — System balance minus DIP reading. Positive = system overstates stock (downward correction needed). Negative = system understates stock (upward correction).
- **Correction type** — `Downward` (fuel physically missing — deduct from oldest lot) or `Upward` (logging or measurement gap — create zero-cost DIP Adjustment Lot)
- **Mandatory reason** — free-text explanation entered by the person recording the measurement (e.g., "Natural evaporation," "Meter rounding," "Unlogged maintenance dispense")
- **Confirmed by** — user ID, name, role (Admin or Owner), and UTC timestamp. Required for above-tolerance corrections. For within-tolerance auto-accepted corrections, this field records the manager who submitted the DIP reading.
- **Lot Consumption references** — for downward corrections: references to the Lot Consumption records created by this correction (see Section 3.9a). For upward corrections: reference to the DIP Adjustment Lot created.
- **Status** — `Auto-Accepted` (variance within tolerance, no elevated approval needed) or `Confirmed` (variance above tolerance, approved by Admin/Owner)

DIP Correction records are immutable once confirmed. They appear in the Inventory Lot Report (Section 7.9), the Daily Balance Sheet (Section 7.2b), and the P&L COGS calculation.

---

### 3.16 Pump Expense

A record of an operational expenditure at a pump location. Expenses are submitted by the Manager or Admin and follow an approval workflow before being included in financial reports.

Each expense record holds:
- **Pump reference** — which pump location this expense belongs to
- **Category** — one of: `FUEL`, `MAINTENANCE`, `SALARY`, `UTILITIES`, `EQUIPMENT`, `OTHER`
- **Amount** — monetary value of the expense (BigDecimal, never float)
- **Description** — free-text description of what the expense was for (mandatory)
- **Expense date** — the date the expense was incurred
- **Approval status** — one of:
  - `PENDING_APPROVAL` — submitted by Manager, awaiting review
  - `APPROVED` — accepted by Admin or Owner
  - `REJECTED` — declined, with a mandatory rejection reason
  - `DRAFT` — saved but not yet submitted for approval (only DRAFT expenses can be deleted)
- **Submitted by** — user ID, name, role, and UTC timestamp of the person who created the record
- **Reviewed by** — user ID, name, role, and UTC timestamp of the Admin/Owner who approved or rejected it
- **Rejection reason** — mandatory free-text field when status is REJECTED

**Auto-approval rule:** Expenses submitted by the Owner or Admin are auto-approved immediately. Expenses submitted by a Manager require Admin or Owner approval if they exceed the pump's configured `ExpenseApprovalThreshold`. If the amount is at or below the threshold, they are also auto-approved.

Approved expenses appear in the Daily Balance Sheet's expense section and feed into the Profit/Loss report for net profit calculation (see Section 7.4). Rejected and Draft expenses are excluded from financial reports.

---

### 3.16b Pump Shift Definition

A configuration record owned by the pump that defines one named shift window. The system uses these records — not a hardcoded enum — to determine valid shift boundaries, auto-close timing, and payroll calculations.

Each Pump Shift Definition holds:
- **Pump reference** — which pump location this definition belongs to
- **Name** — a human-readable label (e.g., "Night Shift", "Morning Shift", "Evening Shift")
- **Start time** — wall clock time the shift window begins (e.g., 00:00)
- **End time** — wall clock time the shift window ends (exclusive). A shift window ending at 08:00 covers the period up to, but not including, 08:00.
- **Is night shift** — boolean flag used by payroll calculations to apply the correct hourly rate (see Section 3.18)
- **Is active** — whether this definition is currently in use

**Overlap rule:** No two shift definitions at the same pump may have overlapping time windows. The system enforces this at the time of creation or update. Group-level date range validation prevents scheduling conflicts across definition sets.

---

### 3.17 Ancillary Product

An ancillary (counter) product is a non-fuel item sold at the pump — for example, engine oil, car wash supplies, air fresheners, or bottled water. The ancillary products system provides full inventory management with FIFO cost tracking, independent of the fuel inventory system.

**Ancillary Product record holds:**
- **Name** — product name (e.g., "Castrol GTX 10W-40")
- **Brand** — manufacturer or supplier brand
- **Variant** — variant or SKU description (e.g., "1L bottle")
- **Package size** — numeric size of the package
- **Unit of measure** — one of: `LITRE`, `KG`, `PIECE`
- **Current stock units** — live count of units on hand (updated on every delivery and sale)
- **Low stock threshold** — unit count below which a `ANCILLARY_LOW_STOCK` notification is triggered
- **GST rate (%)** — the applicable GST rate for this specific product (per-product, not a global setting)
- **Status** — `ACTIVE` or `INACTIVE`

**Ancillary Stock Lot:** Each stock delivery creates an `AncillaryStockLot` — equivalent to an Inventory Lot for fuel — with delivery date, cost per unit, initial units, remaining units, and status (`ACTIVE` / `CONSUMED`). FIFO deduction applies: oldest lot consumed first.

**Ancillary Sale record holds:**
- Product reference and quantity sold
- Revenue (quantity × current sell price)
- GST amount charged
- Payment mode — one of: `CASH`, `UPI`, `CARD`, `FLEET_CARD`, `CREDIT`
- Shift reference (optional — links the sale to a shift if it occurred during an active shift)
- Logged by and timestamp

Ancillary sales and FIFO lot consumption are atomic — when a sale is recorded, the system deducts from the oldest active stock lot immediately. An `AncillaryLotConsumption` record is created for each lot touched (analogous to `LotConsumption` for fuel).

**Relationship to balance sheet:** Ancillary product sales appear as a separate line item on the Daily Balance Sheet (Section 7.2b) under "Product Sales." They are not included in fuel revenue calculations.

---

### 3.18 Payroll Record

A payroll record captures the salary calculation for one employee for a given pay period. It is generated by the Manager or Admin and follows a lifecycle of DRAFT → APPROVED → PAID.

Each Payroll Record holds:
- **Employee reference** — which staff member this payroll record is for
- **Pay period** — start date and end date of the pay period
- **Salary model** — determines how gross pay is calculated:
  - **HOURLY_SHIFT** (used for Nozzle Operators): gross pay = (night shift hours × night shift rate) + (non-night shift hours × standard rate). The system queries all closed shifts for this operator in the pay period, partitions them by `isNightShift` flag on the shift's definition, and computes actual hours from shift start/end times.
  - **DAILY** (used for Manager, Admin, Accountant): gross pay = (total calendar days in period − approved leave days) × daily rate. Leave days are sourced from the `StaffLeave` records for the employee.
- **Snapshotted rates** — the hourly/daily rates at the time of generation are frozen into the record so it remains self-contained and auditable even if rates change later
- **Gross pay** — calculated total before deductions
- **Deductions** — salary deductions linked to resolved shift discrepancies (see Section 3.11)
- **Net pay** — gross pay minus deductions
- **Status** — `DRAFT`, `APPROVED`, or `PAID`. Only DRAFT records can be deleted.
- **Generated by** and **Approved by** — user IDs, names, and UTC timestamps

Payroll records integrate with the Short/Over Sell Ledger — when a discrepancy resolution action is "Salary Deduction," the deduction amount appears in the relevant payroll record's deductions field.

---

### 3.19 Nozzle Calibration Log

A compliance record created each time a nozzle is calibrated by a certified agency. Required by fuel retail regulations; overdue calibration blocks new shifts on the nozzle.

Each Nozzle Calibration Log holds:
- **Nozzle reference** — which nozzle was calibrated
- **Calibration date** — the date the calibration was performed
- **Next calibration due** — the date by which recalibration is required (set at the time of logging)
- **Calibrated by** — name of the certifying agency or engineer
- **Certificate reference** — calibration certificate number (for compliance audit)
- **Notes** — free-text field for any additional observations
- **Logged by** — user ID, name, role, and UTC timestamp of the person who entered the record

**Enforcement:** When a manager attempts to open a shift on a nozzle, the system checks whether the nozzle has a calibration log with a `next_calibration_due` date that has passed beyond a configured tolerance period. If calibration is overdue, the shift is blocked: "Nozzle [X] calibration is overdue since [date]. Please log a new calibration certificate before opening a shift." A `CALIBRATION_DUE` notification is also triggered (see Section 3.20).

---

### 3.20 Notification

An in-app alert generated when a noteworthy event or condition is detected at a pump. Notifications are displayed to relevant users via a notification bell in the UI. They are generated lazily — at the time the user fetches the notification bell — rather than by a background job, to avoid unnecessary processing.

**Deduplication:** Each notification has a `dedup_key` scoped to the pump. The system will not create a duplicate notification for the same event type and dedup key within a pump. This prevents alert flooding when the same condition persists across multiple page loads.

**Supported notification types:**

| Type | Trigger |
|---|---|
| `LOW_STOCK` | Fuel inventory for a tank drops below a configurable threshold |
| `ANCILLARY_LOW_STOCK` | Ancillary product stock drops below its configured low stock threshold |
| `PRICE_STALE` | Global Fuel Sell Price has not been updated within a configurable number of days |
| `DOCUMENT_EXPIRING` | A compliance document is approaching its expiry date |
| `CALIBRATION_DUE` | A nozzle's `next_calibration_due` date has passed |
| `SHIFT_OVERDUE` | A shift has exceeded its scheduled end window and is in OPEN_OVERDUE status |
| `AUTO_CLOSED_SHIFT` | A shift was auto-closed by the overdue job and is awaiting manager end readings |
| `ZERO_SALE_SHIFT` | A shift closed with zero units sold — may indicate a staffing or operational issue |
| `PRICE_CHANGE_OPEN_SHIFT` | The Global Fuel Sell Price was updated while one or more shifts are currently open |

Each notification record holds: pump reference, notification type, title, message body, `dedup_key`, `created_at`, and `read_at` (null until the user views it).

---

A record of fuel dispensed to a credit customer during a specific shift. It is linked to both the shift it occurred in and the credit customer it was for. It holds:
- **Shift reference** — the Shift ID this credit sale belongs to (mandatory foreign key). A credit sale record cannot exist without a parent shift. This is the primary link for attributing the sale to a specific nozzle, price snapshot, and time window.
- The credit customer and vehicle number
- **Fuel type** — explicitly selected from the fuel types available on the nozzle's configured outlets. For nozzles with multiple outlets (e.g., Petrol + Diesel, or Petrol + Speed Petrol), the operator must explicitly select which fuel type was dispensed — the system cannot infer this. For a single-outlet nozzle or a CNG nozzle, the fuel type is pre-selected automatically. The amount is then calculated using the snapshotted price for the explicitly selected fuel type on this shift. A credit sale entry with no fuel type selected on a multi-outlet nozzle will be rejected.
- Quantity dispensed (litres for Petrol/Diesel; kg for CNG)
- Amount charged (calculated as: Quantity × Snapshotted Price for the selected fuel type on this shift)
- Bill number (a physical bill or invoice number for idempotency — the system will not accept the same bill number twice for the same customer. **Bill number uniqueness is enforced across all time — there is no annual reset.**)
- Date and time of the sale
- **Void status** — `Active` or `Voided`. Voided records are retained permanently in the audit log (see Business Rule 7). The shift's credit total is recalculated automatically when a void occurs.

Credit sales are logged during the shift and are automatically included in the shift's handover calculation. At shift close, the total credit amount is read-only — it cannot be edited as part of the handover process, because the individual credit sale records are the source of truth.

---

### 3.8 Credit Payment

A payment received from a credit customer to settle their outstanding balance. Logged by the manager. It holds:
- The credit customer
- **Pump reference** — which pump this payment was logged at (a manager can only log payments for customers linked to their pump)
- Amount paid
- Date of payment
- Payment mode — one of: `Cash`, `Bank Transfer`, `UPI` (for reference and audit only — does not feed into shift cash calculations)
- Which charges it settles — the system applies **strict chronological FIFO across all charge types** (principal sales and interest charges alike, sorted by date) by default. The manager can alternatively select specific bills/charges manually. See Section 4.6 for full settlement logic.
- **Logged by** — user ID, name, and UTC timestamp of the Manager who recorded this payment. Required for audit compliance per Business Rule 32.

---

### 3.9 Tanker Delivery

A record of a fuel delivery received from a supplier tanker. It holds:
- Fuel type (Petrol, Diesel, or CNG)
- **Target Underground Tank** — which specific tank at this pump the fuel was pumped into. This determines which FIFO lot queue the resulting Inventory Lot is added to.
- Quantity delivered (litres for Petrol/Diesel; kg for CNG)
- **Cost price per unit** (₹ per litre for Petrol/Diesel, ₹ per kg for CNG) — **mandatory field, cannot be zero or blank**
- **Delivery date and time** — the date and time the fuel was physically received. This is the date that determines the lot's position in the FIFO queue. See Q23 for the implications of entering a past date.
- **Tanker or invoice reference number** — mandatory for audit trail. No uniqueness constraint enforced (see Q22 resolved). Stored as-is.
- **Logged by** — user ID, name, and UTC timestamp of the Manager who recorded this delivery. Required for audit compliance per Business Rule 32. Immutable once saved.

Each tanker delivery automatically creates an **Inventory Lot** (Section 3.9a) for FIFO cost tracking. Tanker deliveries are also used to update the fuel inventory balance and to calculate the cost side of the profit/loss statement.

---

### 3.9a Inventory Lot

An inventory lot represents the stock from a single tanker delivery into a specific Underground Storage Tank. It is the building block of FIFO cost tracking. Each lot holds:
- The tanker delivery it came from (reference to Section 3.9)
- **Fuel type** (Petrol, Diesel, or CNG), pump location, and **which Underground Tank it was delivered into**
- **Original quantity** (litres for Petrol/Diesel; kg for CNG, as delivered)
- **Remaining quantity** (litres or kg currently available from this lot — starts equal to original quantity, decreases as fuel is sold)
- **Cost price per unit** (copied from the tanker delivery — immutable once created)
- Date of delivery (determines FIFO order — older lots are consumed first)
- Status: Active (has remaining stock) or Exhausted (remaining = 0)

**Critical: FIFO is scoped per pump + fuel type — not per individual underground tank.** A pump with two petrol tanks (Tank A and Tank B) has a single shared petrol FIFO queue that draws from the oldest active lot across both tanks in delivery-date order. Nozzles are not assigned to specific tanks (see Section 3.3), so deduction at shift close is always pump-wide for a given fuel type. Lots are tagged with a `tank_id` to support INACTIVE tank exclusion (see below), but there is no separate queue per tank. This means a lot delivered to Tank A can be used to settle COGS for a shift that happened to draw fuel from the same type available in Tank B — the FIFO queue spans all active tanks for that fuel type at the pump.

**INACTIVE tank exclusion:** If a tank is set to INACTIVE status, all inventory lots tagged with that tank's ID are **excluded from the FIFO queue** for the duration. The stock in those lots is frozen. When the tank is re-enabled (set back to ACTIVE), its lots immediately re-enter the queue in their original delivery-date order.

**CNG tankers are separate from liquid fuel tankers.** A CNG delivery creates a CNG lot in the CNG FIFO queue only. Petrol, Speed Petrol, Diesel, and Speed Diesel each have their own independent FIFO queue at the pump level. No cross-fuel-type deduction is ever performed.

**How FIFO works in practice:** When a shift closes and units sold are confirmed, the system deducts those litres/kg from the oldest active lot **for that fuel type at this pump** first, skipping any lots from INACTIVE tanks. If a single shift's sales exhaust one lot, the system automatically moves to the next oldest lot for the remaining deduction. The system records exactly how many units came from each lot so the P&L can calculate the exact COGS. This transition between lots is handled automatically by the system — no manual intervention is required.

**Lot Consumption record:** Each time a shift close (or DIP Correction) deducts units from a lot, the system creates a **Lot Consumption record** — a sub-record linking the deduction event to the lot. Each Lot Consumption record holds:
- The Inventory Lot it deducted from
- The source of the deduction: Shift Close or DIP Correction (with the relevant Shift ID or DIP Correction ID)
- The quantity consumed (litres or kg) from this specific lot in this event
- The cost price per unit at the time of deduction (copied from the lot — immutable)
- Total cost of this consumption (quantity × cost price)
- The date and time the consumption was recorded

Lot Consumption records are the atomic unit of COGS calculation. The P&L computes COGS by summing the total cost across all Lot Consumption records for the selected period. The Inventory Lot Report (Section 7.9) uses these records to show the full consumption history per lot.

**Example:** Petrol FIFO queue at Pump 1 (spans all petrol tanks) — Lot A (Tank 1, March 10): 20,000 litres at ₹80/L, remaining = 20,000. Lot B (Tank 2, March 15): 15,000 litres at ₹85/L, remaining = 15,000. A shift closes with 22,000 litres of petrol sold. The system deducts: 20,000 from Lot A (Lot A is now Exhausted) and 2,000 from Lot B (Lot B remaining = 13,000). Two Lot Consumption records are created: one for 20,000L at ₹80 (Lot A), one for 2,000L at ₹85 (Lot B). COGS for this shift = (20,000 × ₹80) + (2,000 × ₹85) = ₹1,770,000. The Diesel, Speed Petrol, Speed Diesel, and CNG queues are unaffected by this petrol shift close.

---

### 3.10 Fuel Inventory

Fuel inventory is tracked **per underground tank** at the physical storage level — each tank has its own running balance that increases when a tanker delivery is logged to it. However, **FIFO deduction at shift close is scoped per pump + fuel type** (not per tank individually). Units sold are deducted from the oldest active lot across all tanks of the same fuel type at the pump, in delivery-date order. INACTIVE tank lots are excluded from FIFO deduction until the tank is re-enabled (see Section 3.13 and Section 3.9a). The Fuel Inventory view shows each tank's current stock balance separately, along with a pump-level aggregate per fuel type.

**Opening stock:** When a pump is first set up, every tank starts at zero. The first tanker delivery logged to any tank establishes the opening stock for that fuel type at the pump. Until at least one delivery has been logged for a fuel type, no shift on a nozzle outlet of that type can be started. The system warns: "No inventory on record for [Fuel Type] at this pump. Please log a tanker delivery first."

**Daily DIP reconciliation:** See Section 4.12. The system's calculated balance (deliveries minus sales) is reconciled against the physical dip measurement once per calendar day per tank. The DIP reading is the authoritative closing stock figure for the daily balance sheet.

---

## 4. System Flows

This section describes every major user journey in the system in narrative form. Each flow is written step by step, covering what happens, who does it, what the system does in response, and why each step matters.

---

### 4.1 Shift Start Flow

**Who performs this:** The Manager (via web app or mobile app)

**When it happens:** A shift can be opened at any time. The manager selects the shift window (Shift 1, 2, or 3) and opens it for an operator whenever the operator starts working — this does not have to be exactly at 12:00 AM, 8:00 AM, or 4:00 PM. However, every open shift **must be closed before its window's scheduled end time** (12:00 AM for Shift 3, 8:00 AM for Shift 1, 4:00 PM for Shift 2). If a shift is not closed by the window end time, it is marked Overdue (see Section 6.11). If a nozzle has no operator assigned for a particular shift window, the manager simply leaves that nozzle without opening a shift — the nozzle remains available but idle.

**Why it matters:** The start reading establishes the baseline from which fuel sales will be measured. The price snapshot at this moment — automatically pulled from the Global Fuel Sell Price — ensures that no matter when the shift ends, the calculation will always use the price that was current when the shift opened. Start readings are also validated against the previous shift's end reading to detect any discrepancies before work begins.

**Step-by-step:**

1. The manager navigates to the shift management section for their pump location and selects "Start New Shift."

2. The manager selects the **shift window**: Shift 1 (12:00 AM–8:00 AM), Shift 2 (8:00 AM–4:00 PM), or Shift 3 (4:00 PM–12:00 AM).

   **Shift window validation:** The system checks whether the selected shift window is consistent with the current clock time. If the manager selects a window whose scheduled end time has already passed (e.g., selecting Shift 1 at 10:00 AM, when Shift 1 ended at 8:00 AM), the system blocks the selection: "Shift 1 (12:00 AM–8:00 AM) has already ended. You can only open a shift for the current or upcoming window." The manager may open a shift for the current window (in progress) or the next upcoming window (to prepare in advance), but not for a window that has already closed. Exception: if a previous shift on this nozzle is in "Auto-Closed — Overdue — Awaiting Reading" state, the manager may still enter the retroactive readings for it outside the original window — but that is handled as a reading submission, not a new shift open.

3. The manager selects the operator. The system enforces that an operator can only have **one open shift at a time** — if the selected operator already has an open shift on any nozzle, the system blocks this and shows: "Operator [Name] already has an open shift on Nozzle [X]. Please close that shift first."

4. The manager selects the nozzle unit. The system only shows nozzles that are currently Active and do not have an open shift on them.

5. The system displays the **current Global Fuel Sell Price** for each fuel type on the selected nozzle's outlets (e.g., "Petrol: ₹103.50/L — set on [date] by [user]", "Diesel: ₹90.20/L — set on [date] by [user]"). One price is shown per outlet fuel type. This price will be locked for the entire shift. The manager reviews this and confirms. **The manager does not type a price here** — prices are maintained centrally in the Global Fuel Sell Price record (see Section 3.4). If the displayed price is wrong, the manager must exit this flow, update the Global Fuel Sell Price first, and then re-open the shift.

6. The manager records the start meter reading(s) — **one per outlet on the selected nozzle**:
   - Each outlet has its own totalizer meter. The manager must enter a reading for every outlet on the nozzle (e.g., a nozzle with Petrol and Speed Diesel outlets requires two readings; a CNG nozzle requires one reading).
   - **Validation:** For each outlet, the system checks the entered start reading against that outlet's `last_reading` (the end reading from the most recent closed shift). If the start reading entered is **less than** the outlet's last reading, the system warns: "Previous shift on this outlet ended at [X]. You have entered [Y] as the start reading. Please verify — the reading must be equal to or greater than [X]." The manager must correct the reading or confirm with a mandatory reason (e.g., the meter was reset by an engineer — see Section 6.1).

7. The manager confirms and submits.

8. The system:
   - Snapshots the current Global Fuel Sell Price for each fuel type permanently against this shift record.
   - Creates the shift record with status "Open," operator, nozzle, start readings, shift window, and price snapshot.
   - Marks the nozzle as "In Use."

9. The manager sees a confirmation: "Shift opened for [Operator Name] on Nozzle [X] — Shift 2 (8:00 AM–4:00 PM). Prices locked: Petrol ₹[XX]/L, Diesel ₹[XX]/L."

**Example:** Manager Raju opens Shift 2 on Nozzle 3 (configured with Petrol and Diesel outlets) for Suresh at 8:00 AM. The previous shift ended with the Petrol outlet at 45,230 and the Diesel outlet at 18,750. Raju enters 45,230 (Petrol) and 18,750 (Diesel) as start readings — both match the outlet last readings, validation passes. The system displays the current Global Fuel Sell Price: Petrol ₹103.50/L and Diesel ₹90.20/L. Raju confirms. These prices are now locked for Suresh's shift. If Raju later updates the global Petrol price to ₹104.00/L at 10:00 AM, Suresh's running shift continues to calculate at the locked ₹103.50/L — the new price will only apply from the next shift opened after the update.

---

### 4.2 Shift End / Handover Flow

**Who performs this:** The Manager records the end readings. The Operator (or Manager on their behalf) submits the payment breakdown.

**When it happens:** At the end of each 8-hour shift before the next shift or operator begins.

**Why it matters:** This is the core accountability moment in the system. It determines exactly how much fuel was sold, how much money should have been collected, and whether the money actually collected matches. Any gap must be explained and acknowledged — it cannot be silently ignored.

**Step-by-step:**

1. The manager navigates to the active shift for the relevant nozzle and selects "Close Shift."

2. The manager records the end meter reading(s) — **one per outlet on that nozzle**. These are the current readings on the physical machine at the moment of handover. Each outlet meter is read and entered independently.

3. The system immediately calculates per outlet:
   - **Units Sold (outlet)** = End Reading (outlet) − Start Reading (outlet)
   - **Revenue (outlet)** = Units Sold (outlet) × Snapshotted Price for that outlet's fuel type
   - **Total Amount Due** = Sum of revenue across all outlets on this nozzle

   For example, a nozzle with Petrol and Diesel outlets produces two sets of readings and two revenue figures which are summed. A CNG nozzle produces a single kg-based reading and revenue figure.

4. The system also retrieves all credit sales that were logged during this shift and calculates the **Credit Total** for this shift (sum of all credit sale amounts).

5. The manager (or the operator via the mobile app) now enters the **payment breakdown**:
   - **Cash Collected** — the physical cash the operator is handing over
   - **UPI Collected** — the total UPI payments (e.g., PhonePe, GPay, Paytm) collected during the shift (manually entered for now — future POS integration will auto-populate this)
   - **Card Collected** — the total credit/debit card payments collected during the shift (manually entered separately from UPI)
   - **Credit Total** — this field is auto-populated from the logged credit sales and is read-only. The manager cannot change it here; if it is wrong, the credit sale records must be corrected separately.

   **Why UPI and Card are separate:** These are distinct payment methods with different settlement timing and reconciliation needs. POS terminal integration (future enhancement) will feed these separately. Tracking them separately from day one avoids a data migration later.

6. The system validates: **Cash + UPI + Card + Credit Total must equal Total Amount Due.**

   - **If they match:** The shift is marked as "Closed — Balanced." A Shift Balance Sheet is generated and stored. The fuel inventory is reduced by the total units sold in this shift.

   - **If they do not match:** The system calculates the discrepancy: `Discrepancy = Total Amount Due − (Cash + UPI + Card + Credit Total)`. A positive discrepancy means money is **short** (operator collected less than expected — the most common case). A negative discrepancy means there is a **surplus** (operator collected more than expected — unusual, warrants investigation). The system flags this prominently and **blocks the shift from closing** until the manager acknowledges the discrepancy with a written reason.

     After entering the reason, the manager must also select the **resolution action**:
     - **Salary Deduction** — the short amount will be deducted from the operator's next salary payment
     - **Cash Recovery** — the operator will pay the short amount in cash (either now or in instalments)
     - **Waived** — the manager/owner has decided to waive this discrepancy (e.g., genuine machine error, customer dispute resolved in operator's favour). Requires an explicit confirmation to prevent misuse.
     - **Pending Investigation** — the discrepancy is logged but the resolution method has not yet been decided (manager will resolve it separately)

     The shift is marked **"Closed — Discrepancy Pending"** until a resolution action is set and confirmed. Once the resolution is acted upon (salary deduction applied, or cash received), the manager marks it **"Resolved"** on the operator's ledger.

     All discrepancies — regardless of resolution status — are posted to the **Operator Short/Over Sell Ledger** (Section 3.11) immediately at shift close. The cumulative outstanding short balance for the operator updates in real time.

7. The manager sees the completed Shift Balance Sheet summary on screen and can download it.

**Example:** At the end of a shift, the system calculates that Suresh should have collected ₹18,450 (from petrol sales) + ₹9,100 (from diesel sales) = ₹27,550 total. Credit sales during this shift were ₹2,200. So Cash + UPI + Card should equal ₹25,350. Suresh hands over ₹24,900 cash, ₹300 UPI, and ₹150 card — total ₹25,350. It matches. Shift closes cleanly.

If Suresh had handed over only ₹25,100, the system flags a ₹250 short. Manager Raju types a reason ("Operator claims gave change for ₹1,000 note but cannot locate the difference") and selects "Pending Investigation." The shift closes. Suresh's outstanding short balance on the Operator Ledger becomes ₹250. When Raju decides the next day that Suresh will pay it back in cash, he logs the ₹250 cash recovery, marks the discrepancy resolved, and the ledger clears.

---

### 4.3 Partial Handover Flow

**Who performs this:** The Manager

**When it happens:** When an operator needs to leave before their 8-hour shift ends and a second operator takes over mid-shift on the same nozzle.

**Why it matters:** Accountability must not break when one operator leaves and another takes over. The system must create a clean break — each operator is only accountable for the fuel dispensed and money collected during their specific portion of the shift.

**Step-by-step:**

1. The manager navigates to the open shift for the nozzle where the handover is happening.

2. The manager selects "Partial Handover" (or "Early Close").

3. The manager records the **current meter reading** as the end reading for the first operator's shift. This is done at the exact moment of handover — not at the original scheduled end time.

4. The system calculates units sold and amount due for the first operator's portion, exactly as in the standard shift end flow (Section 4.2).

5. The first operator submits their payment breakdown (cash, UPI, card, credit) for their portion of the shift. The same validation and discrepancy handling applies.

6. The first operator's shift is marked as Closed.

7. **Immediately after**, the manager opens a new shift on the same nozzle for the second operator, recording a fresh start reading. This start reading will typically be the same number as the end reading of the first operator's shift (since the meter keeps running), but it is recorded independently to give the second operator a clean baseline.

8. The second operator's shift proceeds as normal through to its end.

9. **Both shifts are completely independent records** linked to the same nozzle and calendar date. In all reports — including the Daily Balance Sheet and Operator Duty Report — each sub-shift appears as its own **separate row**, not nested or merged under a parent record. This ensures each operator's accountability is clearly visible and unambiguous. The daily totals roll up across all individual shift rows for that nozzle.

**Example:** Khalid starts his shift on Nozzle 2 at 6:00 AM with a petrol reading of 60,000 litres. At 11:00 AM (5 hours in), he needs to leave. The petrol meter now reads 60,890 litres. The manager records 60,890 as Khalid's end reading — he sold 890 litres worth ₹92,115 at today's price. Khalid submits his cash and UPI collected.

Then the manager opens a new shift for Ahmed on the same Nozzle 2, with a start reading of 60,890 litres. Ahmed runs his shift until 3:00 PM (the end of the original shift window). At 3:00 PM, the reading is 61,450 litres. Ahmed sold 560 litres.

The daily report shows both Khalid's and Ahmed's shifts under Nozzle 2 for that date.

---

### 4.4 Double Duty Flow

**Who performs this:** The Manager

**When it happens:** When an operator works two consecutive 8-hour shifts without a break (or with a brief break but no shift change).

**Why it matters:** Even though it is the same person, each 8-hour block must be a separate, independent shift record. This ensures that the daily balance sheet has consistent shift granularity and that accountability is maintained at the shift level.

**Step-by-step:**

1. The first 8-hour shift proceeds and closes normally, following the standard shift end flow (Section 4.2). The operator submits their payment breakdown and the shift closes.

2. The manager then explicitly opens a **second shift** for the same operator, either on the same nozzle or a different nozzle. This is not automatic — the manager must consciously start a new shift.

3. The manager records a fresh start reading for the second shift, even if it is on the same nozzle (in which case, the start reading of the second shift will be the same as the end reading of the first shift, but it is recorded independently).

4. The second shift then runs as its own complete, independent shift record.

5. **Reports** can show both shifts separately (e.g., operator worked Shift 1: 12:00 AM–8:00 AM and Shift 2: 8:00 AM–4:00 PM) or roll them up together in an operator duty summary, depending on the report type.

**Why separate records matter:** If there is a discrepancy, the system can pinpoint whether it occurred in the first or second 8-hour block. It also ensures that if there were any price changes between the two shifts, each shift uses the correct price.

---

### 4.5 Credit Sale Logging Flow

**Who performs this:** The Manager or the Nozzle Operator (during their active shift)

**When it happens:** Any time during an active shift when a credit customer arrives and receives fuel on their account rather than paying cash.

**Why it matters:** Credit sales must be logged individually with a bill number to prevent duplicate entries and to ensure the end-of-shift credit total is accurate and traceable.

**Step-by-step:**

1. The operator (via mobile app) or manager selects "Log Credit Sale" within the context of the active shift.

2. They select the credit customer from the list of registered credit customers at this pump.

3. They select the vehicle number (if the customer has multiple vehicles, the correct one must be selected for traceability).

4. They enter:
   - **Fuel type** — for a nozzle with **multiple outlets** (e.g., Petrol + Diesel, or Petrol + Speed Petrol), the operator must explicitly select which fuel type was dispensed. The system cannot infer this from the meter alone. For a **single-outlet nozzle or a CNG nozzle**, the fuel type is pre-selected automatically. If the operator does not select a fuel type on a multi-outlet nozzle, the system blocks the entry.
   - **Quantity dispensed** (litres for all non-CNG types; kg for CNG)
   - **Physical bill number** from the paper bill given to the customer

5. The system automatically calculates the amount: `Quantity × Snapshotted Price for the selected fuel type on this shift`. The correct snapshotted price is looked up by fuel type from the shift's price snapshot record.

6. Before saving, the system checks:
   - **Overdue billing cycle:** Has the customer's previous billing cycle ended without full payment? If yes, the system **hard-blocks** the credit sale: "New credit sales are blocked for [Customer Name]. Their billing cycle ended on [Date] with ₹[X] outstanding. The overdue balance must be fully settled, or an Admin/Owner must grant a Credit Extension before new credit sales can be logged." The manager and operator cannot override this block — only Admin or Owner can grant a Credit Extension (type: `Overdue Block Waiver` or `Billing Cycle Extension`) to resume sales. If an active Credit Extension exists for this customer at this pump, the block is suppressed and the sale proceeds normally.
   - **Duplicate bill number:** Has this bill number already been entered for this customer at any point in time? If yes, the system rejects the entry with a clear error: "Bill number [XXXX] already recorded for this customer. Please verify."
   - **Credit limit (pump-level):** Will adding this sale cause the customer's **outstanding balance at this pump** to exceed the credit limit? The manager sees only this pump's portion of the customer's balance — they do not have visibility into the same customer's transactions at other pumps of the same owner. The credit limit check is therefore based on the pump-level balance only. If the pump-level balance would exceed the credit limit after this sale, the system displays a warning: "This sale of ₹[X] will take [Customer Name]'s balance at this pump to ₹[Y], which exceeds their credit limit of ₹[Z]." The manager can override this warning by confirming and providing a reason. The operator cannot override — they must get manager approval.

7. If all checks pass, the credit sale is saved and linked to the active shift. The customer's outstanding balance updates immediately.

8. The credit sale will appear in the shift's handover summary as part of the Credit Total and is read-only at that stage.

---

### 4.6 Credit Payment Settlement Flow

**Who performs this:** The Manager

**When it happens:** When a credit customer comes in to pay off part or all of their outstanding balance.

**Why it matters:** Payments need to be correctly applied to the right bills to keep the ledger accurate and allow clean billing statements at cycle end.

**Step-by-step:**

1. The manager navigates to the Credit Customers section and selects the customer making the payment.

2. The manager sees the customer's current outstanding balance and a list of all unpaid or partially paid credit sale bills, ordered from oldest to newest.

3. The manager enters the **payment amount** and the **payment mode** (cash, bank transfer, UPI — for reference and audit purposes only; this does not feed into shift cash calculations). The system **validates that the payment amount does not exceed the customer's total outstanding balance.** If the entered amount is greater than the outstanding balance, the system rejects it: "Payment amount ₹[X] exceeds the total outstanding balance of ₹[Y]. Please enter a valid amount." No overpayments or advance credits are accepted.

4. The system offers two settlement options:
   - **Automatic FIFO settlement:** The system applies the payment to the **oldest outstanding charge first**, regardless of whether that charge is a principal sale or an interest charge. All charges — sales and interest — are treated equally in the FIFO queue, sorted by their date. If the payment covers only part of a charge, that charge is marked as partially paid with the remaining balance noted.
   - **Manual bill-wise settlement:** The manager selects specific bills/charges to settle and allocates the payment accordingly. Useful when a customer is paying for specific deliveries.

5. The manager confirms the settlement.

6. The system:
   - Creates a credit payment record.
   - Updates the balance of the relevant credit sale bill(s) (marking them paid or partially paid).
   - Updates the customer's total outstanding balance.

7. The manager can immediately generate an updated account statement showing what was settled and the remaining balance.

**Example:** Ramesh's Logistics has three outstanding bills: Bill 101 for ₹3,200 (dated March 10), Bill 112 for ₹1,800 (dated March 17), and Bill 125 for ₹2,500 (dated March 24). Their total outstanding is ₹7,500. Today, they pay ₹5,000. With FIFO, the system pays off Bill 101 (₹3,200) and Bill 112 (₹1,800) in full = ₹5,000. Outstanding balance drops to ₹2,500 (Bill 125 unpaid).

---

### 4.7 Fuel Price Management

**How prices work:** Fuel prices are maintained centrally as a **Global Fuel Sell Price** (per fuel type, per pump) by the Admin or Manager. When a shift is opened, the system automatically snapshots the current global price into the shift record — no manual price entry at shift start (see Section 3.4 and Section 4.1, Step 5). The price is locked from that moment and cannot be changed while the shift is open.

**Price history:** Every time a new Global Fuel Sell Price is saved, the system records it. The full price history for each fuel type at each pump is always available for review — who changed it, when, and to what value (see Section 7.4 P&L, Section 7.1 Shift Balance Sheet). History is immutable — past entries cannot be edited.

**Why this approach:** Because the price is maintained centrally and snapshotted at shift open, there is no risk of a price change corrupting an already-open shift. Each shift's price is always its own locked snapshot captured at the moment it was opened. If the fuel company changes the price today, the Admin/Manager updates the Global Fuel Sell Price and the next shift to open will automatically pick up the new price.

**Price visible in reports:** Every shift balance sheet shows the price that was locked for that shift with the label "Price locked at shift start." This eliminates any dispute between what was charged and what was in effect at the time.

---

### 4.8 Tanker Delivery Logging Flow

**Who performs this:** The Manager

**When it happens:** Whenever a fuel supplier tanker delivers fuel to the pump location.

**Why it matters:** Every litre delivered has a purchase cost. Without logging deliveries, there is no way to calculate how much the pump spent on fuel, and therefore no way to calculate profit. Delivery records are also important for inventory management.

**Step-by-step:**

1. The manager navigates to "Fuel Deliveries" (or "Inventory") and selects "Log New Delivery."

2. The manager enters:
   - **Fuel type** (Petrol, Diesel, or CNG). Each fuel type must be logged as a separate delivery record even if Petrol and Diesel arrive on the same tanker. CNG is always a completely separate tanker and a separate delivery record.
   - **Target Underground Tank** — the manager selects which specific underground tank this delivery is being pumped into (e.g., "Tank 1 — Petrol"). Only tanks of the matching fuel type are shown. This determines which FIFO lot queue the new lot is added to.
   - **Quantity delivered** — in **litres** for Petrol or Diesel; in **kg** for CNG. The system pre-labels the quantity field with the correct unit based on the selected fuel type.
   - **Cost price per unit** — ₹ per litre for Petrol/Diesel; ₹ per kg for CNG. This is the price paid to the supplier — mandatory and cannot be zero.
   - **Date and time of delivery**
   - **Tanker number or supplier invoice reference number** (for audit purposes)

3. The manager submits the entry.

4. The system:
   - Creates a tanker delivery record.
   - **Creates an Inventory Lot (Section 3.9a)** — a new lot is added to the FIFO queue of the **specific underground tank** selected. The lot's cost price is set from this delivery and is immutable. The lot starts with remaining quantity equal to delivered quantity.
   - Adds the delivered quantity to the stock balance of that specific underground tank.

5. The manager sees the updated inventory balance:
   - For Petrol/Diesel: "[Fuel Type] inventory updated. Previous balance: [X] litres. Delivery: [Y] litres. New balance: [X+Y] litres. New Inventory Lot created."
   - For CNG: "CNG inventory updated. Previous balance: [X] kg. Delivery: [Y] kg. New balance: [X+Y] kg. New Inventory Lot created."

**Important note:** Tanker deliveries can be logged even when shifts are active. The inventory update and new lot creation happen immediately. It does not affect any currently open shift — the sell prices for those shifts were locked at their start time and do not change based on delivery cost price.

**Relationship to P&L:** The cost price per unit in each Inventory Lot is used by the Profit/Loss report via FIFO consumption. When a shift closes and units sold are deducted from lots, the system records exactly how many units came from each lot and at what cost. This produces an exact COGS figure — see Section 7.4 and Section 3.9a for detail.

---

### 4.9 Report Generation Flow

**Who performs this:** Manager (for their assigned pump) or Owner (for any pump)

**When it happens:** On demand at any time.

**Why it matters:** Reports are the primary tool through which the business is understood. Managers use shift balance sheets to verify every handover is clean. Owners use daily and custom-range reports to understand performance across locations. The P&L tells them whether the business is profitable.

**Step-by-step:**

1. The user (manager or owner) navigates to the Reports section.

2. They select the report type: Shift Balance Sheet, Daily Balance Sheet, Custom Date Range, Profit/Loss, Credit Customer Ledger, or Operator Duty Report.

3. Depending on the report type, they apply filters:
   - **Shift Balance Sheet:** Select pump, nozzle, and shift (by date and operator)
   - **Daily Balance Sheet:** Select pump and date
   - **Custom Date Range:** Select pump, start date, end date, and optional filters (fuel type, operator, payment type)
   - **Profit/Loss:** Select pump and date range
   - **Credit Ledger:** Select pump and credit customer; optionally select billing cycle
   - **Operator Duty Report:** Select pump, operator, and date range

4. The system fetches the relevant data, aggregates it, and displays it on screen in a structured format.

5. The user can then download the report as a PDF or an Excel file.

Each report type is specified in detail in Section 7.

---

### 4.10 Short/Over Sell Resolution Flow

**Who performs this:** The Manager (or Owner for visibility)

**When it happens:** After a shift is closed with a discrepancy, at any point when the manager decides on the recovery method or receives the cash from the operator.

**Why it matters:** Tracking discrepancies at shift close is not enough — the system must also track whether the shortfall was ever recovered, and how. Without this, an operator could accumulate large outstanding amounts that management is unaware of.

**Step-by-step:**

1. The manager navigates to the **Operator Short/Over Sell Ledger** (accessible from the operator's profile or from the Reports section).

2. The ledger shows all shifts with unresolved discrepancies for this operator, along with the cumulative outstanding short amount.

3. For each unresolved discrepancy, the manager can take an action:

   - **Mark as Salary Deduction:** The manager confirms that this amount will be deducted from the operator's salary. The system records the deduction date and the salary period it applies to. The discrepancy moves to "Resolved — Salary Deduction." The outstanding short balance reduces by this amount.

   - **Record Cash Recovery:** The operator pays back some or all of the shortfall in cash. The manager enters the amount received. This can be a partial recovery (e.g., operator pays ₹500 of a ₹1,200 shortfall — the remaining ₹700 stays as outstanding). Each cash recovery is logged with a date and amount. Once the full amount is recovered, the discrepancy is marked "Resolved — Cash Recovered."

   - **Waive:** The manager decides to write off the discrepancy. A mandatory reason must be entered. The discrepancy is marked "Resolved — Waived." The outstanding short balance reduces, but the waiver is permanently visible in the audit trail.

4. The operator's cumulative outstanding short balance is always visible on their profile and in the Operator Short/Over Sell Report (Section 7.7).

**Example:** Over the past month, Suresh has had three short discrepancies: ₹250 (March 5), ₹400 (March 12), and ₹180 (March 25). Total outstanding: ₹830. The manager decides to deduct ₹830 from his April salary. He marks all three as "Salary Deduction — April payroll." The outstanding balance drops to zero. All three entries remain in the history with the resolution action and date recorded.

---

### 4.11 Credit Customer Interest Calculation Flow

**Who performs this:** The System (automated at the end of each interest period). Manager or Owner reviews and confirms before posting.

**When it happens:** At the end of each interest period (end of each week for weekly customers, end of each month for monthly customers), for all credit sales that are still outstanding and have an interest rate > 0%.

**Why it matters:** Interest accrues from the date of each individual purchase, not from the start of a billing cycle. Unpaid interest compounds — it is added to the outstanding balance before the next period's interest is calculated. This must be accurate, transparent, and auditable for every customer.

**Step-by-step:**

1. The owner sets the interest configuration on a credit customer's profile:
   - **Interest Rate (%):** e.g., 2% per week, or 5% per month
   - **Interest Period:** Weekly or Monthly
   - A rate of 0% means no interest is ever charged for this customer
   - Rate and period can only be changed by the owner; changes take effect from the next period

2. When a credit sale is logged, the system records the **purchase date** as the interest accrual start date for that specific sale. The first interest period starts on the purchase date and ends at the nearest period boundary:
   - For **weekly** interest: the period ends on the coming **Monday** (start of next week)
   - For **monthly** interest: the period ends on the **1st of the next calendar month**
   - The first period interest is **pro-rated** based on the number of days in the partial period vs the full period. For example: a weekly customer buys on Wednesday. The period ends the coming Monday (5 days: Wed, Thu, Fri, Sat, Sun). Interest = Principal × Rate × (5/7). From week 2 onwards, interest is calculated on the full 7-day rate.
   - Subsequent periods follow the full weekly/monthly rate from their regular boundaries.

3. At the end of each interest period, the system runs the interest calculation for all qualifying customers:

   **For each outstanding credit sale (per customer):**
   - Identify the base amount: `Principal of this sale + any unpaid interest carried forward from previous periods for this sale`
   - Apply: `Interest = Base Amount × Interest Rate (%)`
   - This is **compound interest** — if last period's ₹15 interest was not paid, this period's base includes that ₹15

   **Aggregate per customer:**
   - Sum all per-sale interest charges into one total interest charge record for the period
   - The record shows the breakdown per credit sale so the customer can verify

4. The system stages the interest charges as "Pending Confirmation" — they are calculated but **not yet posted** to the customer's ledger.

5. The **Manager or Admin at each pump** reviews and confirms the interest charges for transactions that occurred at their pump. Interest confirmation is pump-level — they only see and confirm interest for credit sales that happened at their own pump. If the same customer has transactions at multiple pumps, each pump's Manager or Admin confirms independently for their pump's portion. The Owner can view all interest charges across all pumps.

   For each staged charge, the manager can:
   - **Confirm** — interest is posted to the ledger, customer's outstanding balance increases
   - **Adjust** — change the interest amount for this customer with a mandatory reason (e.g., dispute, goodwill exception). The adjustment is audit-logged.
   - **Skip this period** — for a one-time exception (not a permanent rate change)

6. Once confirmed, interest charges appear as line items in the Credit Customer Ledger and are included in billing statements.

**Example — compound interest with pro-rated first period:**
- Customer: Ramesh's Logistics. Weekly interest rate: 1.5%. Period: weekly (periods end Monday).
- March 10 (Wednesday): Credit sale of ₹10,000. First period: Wednesday to Monday = 5 days.
- March 14 (Monday, end of first partial week): Base = ₹10,000. Pro-rated interest = ₹10,000 × 1.5% × (5/7) = **₹107.14**. Manager confirms. Balance = ₹10,107.14.
- Ramesh does NOT pay by next Monday (March 21).
- March 21 (Monday, end of full second week): Base = ₹10,000 (principal) + ₹107.14 (unpaid interest from week 1) = ₹10,107.14. Full week interest = ₹10,107.14 × 1.5% = **₹151.61**. Manager confirms. Balance = ₹10,258.75.
- From week 3 onwards, full 7-day rate applies each week.
- If Ramesh had paid the ₹107.14 interest in week 1, his week 2 base would be ₹10,000 and interest would be ₹150 — not ₹151.61.

---

### 4.12 DIP-Based Physical Stock Reconciliation Flow

**Who performs this:** The Manager (or Admin)

**When it happens:** **Once per calendar day** — the manager physically dips each underground storage tank with a measuring rod and records the actual quantity in the system. DIP measurement is per tank — not per fuel type in aggregate. This is a mandatory daily activity. It is not weekly or periodic. The DIP is typically performed at end of day (after the last shift of the day closes or at a fixed time the owner configures), but it must be recorded at least once within each calendar day.

**Why it matters:** The system's calculated inventory (deliveries minus shift sales) will rarely match the physical dip measurement exactly. Meters have small measurement variations, fuel evaporates, and minor variances accumulate. Reconciling once per day ensures variances are caught within 24 hours, before they compound. It also provides a reliable closing stock figure for the daily balance sheet.

**Step-by-step:**

1. Once per day (typically after the last shift closes or at end of business), the manager navigates to "Tank DIP Check" in the Inventory section. This is a daily requirement — not per-shift.

2. For **each underground tank** at this pump, the manager records the **physically measured quantity** as read from the dip rod:
   - For Petrol/Diesel tanks: quantity in litres
   - For CNG tanks: quantity in kg
   - If a pump has multiple tanks for the same fuel type (e.g., two petrol tanks), each tank is measured and recorded separately.

3. The system displays a per-tank comparison:
   - System calculated balance for this tank: [X] litres/kg
   - Physically measured: [Y] litres/kg
   - Difference: [X − Y] (positive = system shows more than physical; negative = system shows less)

4. **If the difference is within a configurable tolerance** (e.g., ±20 litres — set by owner per tank): the system automatically accepts the measurement as "Balanced" with no manual correction required. Minor measurement variations within tolerance do not create adjustment records.

5. **If the difference exceeds the configured tolerance**, the manager can record the reading and enter a **mandatory reason** (e.g., "Natural evaporation," "Meter measurement rounding," "Minor unlogged dispense during maintenance"). However, only Admin or Owner can **confirm** the adjustment — the manager cannot approve their own above-tolerance correction. This single threshold (configured per tank, default 20 litres) is the boundary between auto-accept and elevated-approval (see Business Rule 54 and Business Rule 56).

6. The manager confirms. The system:
   - Creates a **"DIP Correction"** record for this tank with the date, physical measurement, system balance, difference, reason, and the identity of the person who confirmed it.
   - For **downward corrections** (system shows more than physical — fuel is physically missing): deducts the difference from the **oldest active Inventory Lot** for that tank (FIFO). If the oldest lot does not cover the full correction, the remainder carries to the next lot. A Lot Consumption record (type: DIP Correction) is created for each lot touched.
   - For **upward corrections** (system shows less than physical — measurement or logging gap): the system creates a **special Inventory Lot** tagged as `DIP Upward Adjustment` with a cost price of ₹0/unit. This lot is added to the FIFO queue for that tank with the adjusted quantity. It is flagged in all lot reports and in the P&L as an unexplained gain — COGS calculated against this lot will be ₹0, which inflates gross profit. The owner must be made aware. Reason: a plain inventory balance increase without a corresponding lot would break FIFO tracking and COGS calculations for all future shift closes on that tank.
   - Updates the tank's inventory balance to the physically measured quantity.
   - All DIP Correction records are permanently visible in the Inventory Lot Report (Section 7.9), the Daily Balance Sheet, and the P&L. They are audit-logged and immutable.

7. If the difference is **unusually large** (e.g., more than 100 litres), the system flags it prominently: "Large stock variance detected on Tank [X]: [N] litres difference. Verify measurements, check for unlogged deliveries, and inspect for possible tank leakage." The flag is retained in the audit trail regardless of the reason given.

**Example:** End-of-day DIP check for Petrol Tank 1. System calculated balance: 4,850 litres. Physical dip measurement reads: 4,795 litres. Difference: −55 litres (exceeds tolerance of 20 litres). Manager enters reason "Natural evaporation and minor meter variation." System deducts 55 litres from the oldest active lot for Tank 1 and records the DIP Correction for today's date. Closing stock for Tank 1 is set to 4,795 litres.

---

### 4.13 Expense Recording and Approval Flow

**Who performs this:** Manager or Admin submits; Admin or Owner approves.

**When it happens:** Any time an operational expense is incurred at the pump (maintenance work, utility bills, equipment purchases, etc.).

**Step-by-step:**

1. The Manager navigates to the Expenses section and selects "Record Expense."

2. They enter: category, amount, description, and expense date.

3. They submit the expense. The system applies the auto-approval rule:
   - If submitted by Owner or Admin — automatically approved.
   - If submitted by Manager and amount ≤ pump's configured `ExpenseApprovalThreshold` — automatically approved.
   - If submitted by Manager and amount > threshold — status is set to `PENDING_APPROVAL` and the Admin/Owner is notified.

4. The Admin or Owner reviews pending expenses and approves or rejects each one with a mandatory reason for rejections.

5. Approved expenses are included in the Daily Balance Sheet and P&L for the expense date. Rejected and Draft expenses are excluded.

Only DRAFT expenses can be deleted. Once submitted (PENDING_APPROVAL) or reviewed (APPROVED/REJECTED), the record is permanent in the audit trail.

---

### 4.14 Shift Planning Flow

**Who performs this:** Manager or Admin

**When it happens:** At the start of each week, to plan staff assignments for the upcoming week.

**Why it matters:** Proactive shift planning ensures the right number of operators are scheduled per shift window, accounts for leave and preferences, and reduces last-minute scrambling.

**Step-by-step:**

1. The Manager navigates to the Shift Planning section and selects the target week (Monday–Sunday).

2. They configure the plan parameters:
   - **Operators per day shift** — how many operators are needed per non-night shift window per day
   - **Operators per night shift** — how many operators are needed per night shift window per day

3. The system generates a draft plan (`status = DRAFT`) by auto-allocating available operators to shift definitions, taking into account:
   - **Staff preferences** — operators can have `PREFER_ON` or `PREFER_OFF` preferences per day of week
   - **Leave records** — operators with a `StaffLeave` record for a given date are excluded from that date's allocation
   - **Rotation rules** — the allocation service distributes shifts fairly across operators

4. The Manager reviews the draft plan. Each entry shows: operator, shift definition, date, and status (`PLANNED`).

5. The Manager can manually adjust assignments before publishing.

6. Once satisfied, the Manager publishes the plan (`status = PUBLISHED`). Published plans are visible to operators and managers.

7. As the week progresses, the Manager can mark individual entries as `CONFIRMED` (operator reported for duty) or `ABSENT` (operator did not show).

**Note:** The shift plan is a scheduling aid — it does not automatically open shifts. The manager still manually opens each shift for the actual operator when the shift begins.

---

### 4.15 Ancillary Product Sale Flow

**Who performs this:** Manager or Admin

**When it happens:** When a customer purchases a non-fuel product from the pump counter.

**Step-by-step:**

1. The Manager navigates to Ancillary Products → Sales and selects "Record Sale."

2. They select the product, enter the quantity sold, select the payment mode (Cash, UPI, Card, Fleet Card, or Credit), and optionally associate the sale with an active shift.

3. The system calculates revenue (quantity × current sell price) and GST amount (using the product's configured GST rate).

4. On save, the system:
   - Deducts the quantity from the oldest active `AncillaryStockLot` (FIFO). If one lot does not cover the full quantity, the deduction spans multiple lots.
   - Creates an `AncillaryLotConsumption` record for each lot touched.
   - Updates the product's `current_stock_units`.
   - Checks if stock has fallen below `low_stock_threshold` and triggers an `ANCILLARY_LOW_STOCK` notification if so.

5. The sale appears in the Daily Balance Sheet under "Product Sales."

---

### 4.16 Payroll Generation Flow

**Who performs this:** Manager or Admin generates; Admin or Owner approves.

**When it happens:** At the end of each pay period (typically weekly or monthly depending on the employee's salary model).

**Step-by-step:**

1. The Manager navigates to Payroll and selects "Generate Payroll."

2. They select the staff member and the pay period (start date and end date).

3. The system calculates gross pay based on the employee's salary model:
   - **HOURLY_SHIFT:** Queries all closed shifts for this operator in the date range. Partitions shifts by `isNightShift` flag. Multiplies night shift hours by `shift1HourlyRate` and non-night shift hours by `standardHourlyRate`. Sums to gross pay.
   - **DAILY:** Counts total calendar days in the period. Subtracts approved leave days (from `StaffLeave` records). Multiplies by `dailyRate`.

4. The system snapshots the rates into the record at generation time — the record is self-contained.

5. The system also fetches any linked salary deduction amounts from the operator's Short/Over Sell Ledger (unresolved discrepancies marked as "Salary Deduction") and adds them to the deductions field.

6. The payroll record is created in `DRAFT` status.

7. The Admin or Owner reviews and approves the record (`APPROVED`). Once paid out, they mark it `PAID`.

8. Only `DRAFT` records can be deleted. `APPROVED` records can be rolled back to `DRAFT` if a correction is needed before payment.

---

### 4.17 Nozzle Calibration Logging Flow

**Who performs this:** Manager or Admin

**When it happens:** After a nozzle is physically calibrated by a certified agency.

**Step-by-step:**

1. The Manager navigates to Calibration in the Setup section.

2. They select the nozzle and enter: calibration date, next calibration due date, calibrating agency name, certificate reference number, and any notes.

3. The system creates a `NozzleCalibrationLog` record.

4. The `next_calibration_due` date is now active. The system will check this date when a shift open is attempted on that nozzle (see Section 3.19 enforcement rule).

5. If a nozzle was previously blocked due to overdue calibration, the new log immediately clears the block — the next shift open attempt will succeed provided all other validations pass.

---

## 5. Business Rules

These are the hard rules the system must enforce without exception. They are not optional validations — they are system-enforced constraints.

1. **A nozzle can only have one open shift at a time.** The system must prevent a second shift from being opened on a nozzle that already has an open shift. The manager must close the current shift before opening a new one (except via the Partial Handover flow, which closes the first and opens the second in sequence).

2. **A shift's fuel price is locked the moment the shift is opened and cannot be changed while the shift is open.** The price is automatically derived from the Global Fuel Sell Price at the instant of shift creation (see Section 3.4). Fuel prices in India change at midnight (12:00 AM), which aligns with Shift 1 start — if a new price is in effect, the Admin/Manager updates the Global Fuel Sell Price before the next shift is opened, and that shift picks up the new price. No shift currently in progress is affected by a global price update made after the shift was opened.

3. **Shift calculations always use the price snapshotted at shift start.** Under no circumstances does a price change affect a shift that has already started. This is immutable once the shift is created.

4. **A shift cannot close without a payment breakdown submission.** Cash + UPI + Card + Credit Total must all be entered before the system will calculate whether the shift balances. UPI and Card are separate fields and must be entered independently.

5. **A discrepancy cannot be silently accepted.** If Cash + UPI + Card + Credit Total does not equal the Total Amount Due, the manager must type a reason before the shift can be closed. There is no way to close a discrepant shift without an acknowledgement.

6. **Credit sale bill numbers must be unique per customer.** If the same bill number is submitted twice for the same customer, the second submission is rejected. This prevents accidental double-entry of the same sale.

7. **A credit sale can be voided on an open shift by the operator who logged it or by the manager.** Once a shift is closed, the credit sale record becomes immutable — it cannot be modified or deleted. If an incorrect credit sale was logged on a closed shift, a compensating entry (credit note or reversing entry) must be created — the original record cannot be changed. Every void requires a mandatory written reason and is permanently retained in the audit log with a "Voided" flag — it does not disappear from the record.

8. **A nozzle marked as Inactive cannot have a shift started on it.** If a manager attempts to start a shift on an inactive nozzle, the system must reject it with a clear explanation.

9. **Start readings must be less than or equal to end readings.** If the end reading is lower than the start reading, the system flags a potential meter rollover (see Section 6) rather than silently calculating a negative units-sold figure.

10. **Fuel inventory cannot go below zero.** If logged sales in a shift would push a fuel type's inventory below zero, the system should flag this as an anomaly (it likely means a delivery was not logged). It does not block the shift from closing, but it generates a warning visible to the manager and owner. Note: the exception to this rule is when no Inventory Lots exist at all — in that case the shift is blocked from closing entirely (see Business Rule 48).

11. **Credit customer outstanding balance updates synchronously in the same transaction as the credit sale.** When a credit sale is saved, the customer's outstanding balance must be updated within the same atomic database transaction — not asynchronously or via a background job. This ensures that a concurrent credit sale from another user immediately sees the updated balance, preventing the credit limit from being silently exceeded by two simultaneous sales. The manager must always see the current, committed balance when making credit decisions. See also Business Rule 33 (DB-level unique constraint) for the same principle applied to shifts.

12. **A credit limit override requires a mandatory reason.** If a manager approves a credit sale that breaches a customer's credit limit, they must provide a written reason. Operators cannot override credit limits — only managers can.

13. **Only the Owner can create and configure pump locations, nozzle units, and underground storage tanks.** Managers cannot add new pump locations, add or remove nozzles, change nozzle types, or add/edit/remove underground tanks.

14. **All reports are read-only.** Reports are generated from historical records and cannot be edited through the reporting interface. Any correction to underlying data follows a defined correction process.

15. **Global Fuel Sell Price history is immutable.** Once a price record is saved, it cannot be deleted or edited retroactively. If a price was set incorrectly, the Admin/Manager saves a new corrected Global Fuel Sell Price record — the history retains both entries with timestamps. Shifts that have already opened and snapshotted the wrong price retain that price for their duration; they cannot be retroactively corrected.

16. **Tanker delivery cost price is entered in full at time of logging and cannot be changed retroactively** once the delivery has been used in a closed P&L report. This protects the integrity of historical profit calculations.

17. **The Owner can view data across all pump locations, but a Manager can only view and act on data from their assigned pump(s).** The API must enforce this at the data access layer, not just in the UI.

18. **Every shift discrepancy must be posted to the Operator Short/Over Sell Ledger at shift close — without exception.** Even if the manager immediately marks it as Waived, it must appear in the ledger history. Discrepancies cannot be hidden by adjusting the submitted payment breakdown after the fact.

19. **A discrepancy resolution action (Salary Deduction, Cash Recovery, or Waived) requires a mandatory reason when the action is "Waived."** Salary Deduction and Cash Recovery are self-explanatory; Waived must always be justified to prevent abuse.

20. **Partial cash recovery is allowed.** An operator can repay a short amount across multiple payments. The system tracks the remaining outstanding balance for each discrepancy until it is fully cleared. The cumulative outstanding short balance on the operator's ledger is always the sum of all unresolved amounts.

21. **Interest is compound — unpaid interest from the previous period is added to the outstanding principal before the next period's interest is calculated.** This applies to all customers with a non-zero interest rate. Simple interest is not used. See Section 3.12 and Business Rule 38 for the full compound interest model.

22. **Interest rate, interest period, and the permanent credit limit are set per customer and can only be changed by the Owner.** A change to the interest rate takes effect from the next interest period — it does not retroactively alter interest already calculated and posted. **Temporary credit limit extensions and billing cycle extensions can be granted by Admin or Owner** via a Credit Extension record (Section 3.6) — this does not change the permanent credit limit, which remains under Owner control only.

23. **Interest charges cannot be auto-posted without manager confirmation.** The system calculates and stages interest charges but does not apply them to a customer's balance until the manager reviews and confirms. This prevents incorrect charges from appearing on customer statements.

24. **A 0% interest rate on a customer profile means no interest is ever charged for that customer.** The system must skip the interest calculation step for such customers entirely.

25. **Interest charges that have been confirmed and posted to a customer's ledger are immutable.** If a manager made an error (wrong rate applied), a corrective credit entry must be created — the original interest record cannot be deleted or edited.

26. **Shifts follow the pump's configured shift definition windows.** By default there are three 8-hour windows covering 24 hours (12:00 AM–8:00 AM, 8:00 AM–4:00 PM, 4:00 PM–12:00 AM), but the owner may configure different windows via Pump Shift Definitions (Section 3.16b). A shift must be closed by its definition's scheduled end time. Shift definition groups must not have overlapping windows. End times are exclusive (a shift ending at 4:00 PM ends before 4:00 PM, not after).

27. **An operator can only have one open shift at a time, across all nozzles.** If an operator already has an open shift on any nozzle, the system must block a new shift from being opened for them until the existing one is closed. **The system must enforce a database-level unique constraint on (operator_id + status=OPEN)** in addition to the application-level check. This is analogous to the nozzle-level constraint in Business Rule 33. Application-level checks alone are insufficient to prevent race conditions when two concurrent shift-open requests are processed simultaneously.

28. **A new shift's start reading must be greater than or equal to the previous closed shift's end reading on the same nozzle.** If the entered start reading is lower, the system blocks the shift from opening and requires the manager to correct the reading or declare a meter rollover/reset (see Section 6.1). This prevents tampering and data entry errors from silently corrupting sales calculations.

29. **A zero-sale shift is a valid and expected outcome.** If a shift ends with the same meter reading as the start (zero litres sold), the amount due is ₹0 and all payment fields are ₹0. The system must close this as "Balanced" without any discrepancy flag. Zero-sale shifts occur when a nozzle has no customers during a shift window and must be recorded for completeness.

30. **An operator cannot be deactivated (removed from the system) while they have an unresolved outstanding short balance.** Before an operator can be marked as inactive/terminated, all discrepancies on their Short/Over Sell Ledger must be fully resolved: either the amount is recovered (salary deduction or cash), or the owner explicitly waives it. Only the owner can perform the final deactivation.

31. **Any manager assigned to a pump can close any open shift on that pump, regardless of which manager opened it.** Shift accountability belongs to the pump, not to the individual manager who created the shift. This ensures that a manager handover or absence does not leave shifts permanently open.

32. **All sensitive user actions must be attributed to the authenticated user who performed them.** Every create or update on: fuel prices, credit customer profiles (credit limit, interest rate), shift discrepancy resolutions, credit limit overrides, inventory adjustments, meter reset events, and waivers — must be stamped with the user's identity (user ID + name) and a UTC timestamp. These stamps are read-only.

33. **The system must enforce a database-level unique constraint on (nozzle_id + status=OPEN) to prevent concurrent race conditions.** Only one open shift per nozzle must be possible at the database level. If two requests arrive simultaneously, only one should succeed; the second must receive a clear rejection. Application-level checks alone are insufficient.

34. **Credit customer overpayments are not accepted.** A payment amount logged against a credit customer cannot exceed their total outstanding balance (principal + interest). The system must reject any attempt to log a payment greater than the amount owed.

35. **CNG is measured in kilograms (kg), not litres.** All CNG readings, shift calculations, inventory balances, prices, and reports use kg and ₹/kg. The system must never mix CNG kg quantities with petrol/diesel litre quantities in any calculation.

36. **Tanker delivery cost price is a mandatory field — it cannot be zero or blank.** If a manager submits a tanker delivery without a cost price, the system must reject it. This is required for FIFO P&L accuracy.

37. **When a new Global Fuel Sell Price is saved, it is validated against the last recorded price for that fuel type at that pump.** If the new price deviates by more than 15% from the last price, the system shows a confirmation warning before the new price is committed: "You are setting [Fuel Type] price to ₹[X]. The last recorded price was ₹[Y]. This is a [Z]% change. Please confirm this is correct." The Admin/Manager must explicitly confirm. This check fires at the point of saving the global price — not at shift open — so any error is caught before it can affect any shift.

38. **Interest is compound — unpaid interest from a previous period is added to the base for the next period's calculation.** The system must track per-sale interest accrual and carry-forward separately from principal. Settlement order follows strict FIFO across all charge types — see Business Rule 55.

39. **A credit sale cannot be logged against a customer whose credit limit is 0.** A credit limit of 0 signals a deactivated customer. The system must hard-block new credit sales for such customers and show: "This customer's credit limit is 0. No new credit sales can be logged. Contact the owner to reinstate the credit limit."

40. **Maximum nozzle count is set at pump configuration time by the owner.** The system enforces this limit — no shift can be opened if the number of open/active shifts already equals the configured maximum. The limit can only be changed by the owner.

41. **Each person has exactly one role in the system.** A person cannot be both a Manager and an Operator simultaneously. Role changes require owner action (deactivate old role, create new profile or update role). All historical records from the previous role are preserved.

42. **FIFO inventory deduction at shift close is scoped per pump + fuel type — not per individual underground tank.** All active lots for a given fuel type at a pump form a single shared FIFO queue, ordered by delivery date. Lots from INACTIVE tanks are excluded from this queue for the duration the tank remains disabled. Lots are tagged with `tank_id` at creation for traceability and INACTIVE exclusion, but FIFO deduction always spans all active tanks for the fuel type at the pump. The system must enforce this scope in the FIFO query (lot must belong to a non-INACTIVE tank for the correct pump and fuel type), not just in application logic.

43. **For a credit sale on a multi-outlet nozzle, the fuel type must be explicitly selected by the person logging the sale.** The system must reject any credit sale entry on a multi-outlet nozzle where the fuel type is not specified — the system cannot infer which outlet was used. For single-outlet nozzles and CNG nozzles, the fuel type is pre-populated automatically. The amount is calculated using the snapshotted price for the explicitly selected fuel type.

44. **Credit sale bill numbers are unique per customer across all time.** There is no annual or periodic reset. If a bill series restarts at 001 in a new year, the manager must add a year prefix (e.g., "2026-001") to make it unique. The system rejects any bill number that already exists for the same customer, regardless of when the original was created.

45. **An operator cannot be deactivated if they have an open shift.** The manager must close or transfer the open shift before the deactivation can proceed. The system must block deactivation attempts and show: "Operator [Name] has an open shift on Nozzle [X]. Please close this shift before deactivating the operator." This is enforced in addition to Business Rule 30 (outstanding short balance must be cleared first).

46. **Physical stock adjustments (DIP Corrections) deduct from or add to the oldest active Inventory Lot first (FIFO order).** Adjustments must be tagged as "DIP Correction" with a mandatory written reason. Every correction is permanently logged in the audit trail and cannot be deleted or edited.

47. **When a shift is closed and FIFO deduction reaches the end of one lot, the system automatically moves to the next oldest active lot for the remaining units.** This transition is seamless and requires no manager action. The system records exactly how many units came from each lot for P&L accuracy.

48. **If a shift is closed and no active Inventory Lots exist for the fuel type being deducted (all lots exhausted, no new delivery logged), the system blocks the shift from closing and alerts the manager.** The alert reads: "No inventory lots available for [Fuel Type]. Please log a tanker delivery, or contact the owner to resolve the inventory discrepancy before this shift can be closed." Shifts cannot be closed against zero-lot inventory — this protects P&L accuracy. **Exception: if a shift closes with zero units sold for a given fuel type (zero-sale scenario — see Business Rule 29), no FIFO deduction is triggered for that fuel type and this rule does not apply.** A zero-sale shift on a dual nozzle where Diesel sold = 0 should not be blocked by the absence of diesel lots, since nothing is being deducted.

49. **A manager's view of a credit customer's balance is pump-level only.** When a manager at Pump B logs a credit sale for a customer who also has transactions at Pump A (same owner), the manager only sees the balance from Pump B. The credit limit check is performed against the pump-level balance. The owner sees the full aggregated balance across all pumps.

50. **A DIP check must be completed for all tanks once per calendar day.** The DIP measurement is mandatory, not optional. The system flags any tank that has not had a DIP reading recorded for the current day as "DIP Pending" on the dashboard. Shifts on nozzles connected to that tank can still proceed, but the DIP Pending flag remains visible until the daily measurement is entered. The system defaults to expecting the DIP at end of day but will accept it at any point during the day.

51. **A credit customer with a billing cycle overdue balance cannot have new credit sales logged.** If the customer's previous billing cycle has ended and the full amount has not been settled, all new credit sales are hard-blocked for that customer at that pump. The block can only be overridden by the **Admin or Owner** — not by the manager or operator. The override is granted via a Credit Extension record (type: `Overdue Block Waiver` or `Billing Cycle Extension`) on the customer's pump link (see Section 3.6). A mandatory written reason is required. The manager and operator can see that a block exists but cannot remove it.

52. **UPI and Card payments are tracked as separate fields in every shift balance sheet.** They must never be combined in the data model. This ensures future POS integration can populate them independently and reporting can distinguish between the two digital payment types.

53. **Post-close meter reading corrections (data entry errors) can only be initiated by the Owner.** A manager or admin cannot correct a meter reading after a shift is closed. The owner creates an audit-logged correction record specifying the original reading, the corrected reading, and a mandatory reason. All recalculations (units sold, amount due, discrepancy) are recomputed and the changes are permanently marked as "Amended — Owner Correction [date]" on the shift record. Note: this rule covers data entry mistakes on a closed shift. Physical hardware events requiring a meter reset (e.g., nozzle repair, calibration) are handled separately via the Meter Reading Amendment entity (Section 3.14) and must be logged before the next shift opens on that nozzle.

54. **Only Admin and Owner can confirm DIP Corrections that exceed the configured tolerance threshold.** A Manager can record a DIP reading, but if the variance exceeds the configured tolerance for that tank, only Admin or Owner can confirm the correction. This prevents a manager from silently hiding large inventory discrepancies.

55. **Interest settlement follows strict FIFO across all charge types.** When a credit customer makes a payment, the oldest outstanding charge is settled first — regardless of whether it is a principal sale, a partial balance, or an interest charge. There is no separate "interest-first" priority. The chronological date of each charge determines the settlement order.

56. **Each underground tank must have a configured stock tolerance for DIP checks.** The owner sets this tolerance (in litres or kg) per tank at pump setup. Variances within tolerance are auto-accepted. Variances exceeding tolerance require a mandatory reason and elevated approval (Admin/Owner). The default tolerance is 20 litres if not explicitly configured.

57. **Operators are permanent in their role — there are no promotions within the system.** An operator will always remain an operator. A person who is promoted to manager in real life must have their old operator profile deactivated by the owner, and a new manager profile created. The two profiles remain separate in the system with no linkage. All historical shifts remain attributed to the original operator profile.

58. **A Credit Extension must always have a mandatory expiry date — open-ended extensions are not permitted.** This prevents a temporary override from silently becoming a permanent policy change. On expiry, normal credit limit enforcement and overdue blocking resume automatically with no manual action required. If the Admin/Owner needs to continue the extension, they must create a new Credit Extension record. Every Credit Extension is permanently logged in the audit trail regardless of whether it has expired.

59. **A Credit Extension is pump-scoped.** An extension granted at Pump A by Admin A does not affect the customer's credit behaviour at Pump B. The Owner, having visibility across all pumps, can grant extensions at any pump. Each Admin can only grant extensions for customers linked to their own assigned pump.

60. **Only one active Credit Extension of each type may exist per customer per pump at a time.** If an Admin/Owner wants to increase an existing extension, they must either expire the current one first or update its terms — the system does not allow stacking multiple simultaneous extensions of the same type (e.g., two active Amount Extensions for the same customer at the same pump).

61. **Only Owner or Admin can disable (INACTIVE) or re-enable (ACTIVE) an underground tank.** Manager and Nozzle Operator roles do not have this permission. The system must enforce this at the API layer (`@PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")`).

62. **New tanker deliveries to an INACTIVE tank are blocked.** If a manager attempts to log a delivery to a tank with status INACTIVE, the system must reject it: "Tank '[name]' is currently disabled. Re-enable it in Setup before recording a delivery." This ensures that frozen stock is not accidentally topped up while the tank is under maintenance.

63. **DIP checks on an INACTIVE tank are blocked.** Physical measurements cannot be recorded for a tank that is not in active service. The same error message as Rule 62 applies: "Tank '[name]' is currently disabled. Re-enable it in Setup before recording a DIP check."

64. **When disabling a tank that holds more than 5% of its configured capacity as current stock, the system must warn the operator before confirming the disable.** The warning format is: "[X]% of stock will be frozen. Confirm?" The disable may proceed regardless — the warning is informational only. If the tank holds 5% or less remaining stock, no warning is shown.

65. **The five supported fuel types are: PETROL, SPEED_PETROL, DIESEL, SPEED_DIESEL, and CNG.** These are the only valid values for all fuel type fields across nozzle outlets, underground tanks, inventory lots, fuel prices, shift readings, and credit sales. No other fuel type codes are accepted by the system.

66. **A nozzle with a CNG outlet cannot also have any non-CNG outlets.** CNG is physically incompatible with liquid fuels on the same dispensing unit. The system enforces this at configuration time: selecting CNG deselects all other outlet types, and selecting any non-CNG type deselects CNG. A nozzle configuration that mixes CNG with any other fuel type must be rejected.

---

## 6. Edge Cases & System Guardrails

The following are known unusual situations the system must handle gracefully. Each one has the potential to cause incorrect data or confuse users if not properly handled.

---

### 6.1 Meter Rollover

**What it is:** Totalizer meters on fuel dispensing machines are mechanical or electronic counters with a maximum value (e.g., 999,999.99 litres). When they hit the maximum, they reset to zero and continue counting from there. If this happens during a shift, the end reading will be lower than the start reading — making the naive calculation (End − Start) produce a negative number.

**How the system handles it:** Whenever the end reading is lower than the start reading (or a new shift's start reading is lower than the previous shift's end reading), the system does not calculate negative units sold. It flags the situation: "Reading [X] is lower than expected [Y]. This may indicate a meter rollover or a planned meter reset."

The manager must select one of two causes:

- **Meter Rollover (Unplanned):** The totalizer naturally hit its maximum (e.g., 999,999.99) and reset to zero. The system calculates the corrected units: `(Maximum Meter Value − Previous Reading) + New Reading`. The manager confirms the maximum meter value for that nozzle model (configurable per nozzle by the owner) and the corrected units are applied.

- **Physical Meter Reset (Maintenance/Engineer):** A certified engineer deliberately reset the meter to zero (or adjusted it to a known value) during repair, maintenance, or calibration work on the nozzle. **Only the owner can log this** — it cannot be declared by a manager alone, to prevent abuse. The owner creates a **Meter Reading Amendment** record (Section 3.14) with type "Meter Reset," recording the pre-reset reading, the post-reset reading, and the work description. Once logged, the system accepts the next shift's start reading as the post-amendment value without triggering this anomaly warning. A permanent audit note is attached to all subsequent shifts on that nozzle.

---

### 6.2 Nozzle Taken Offline for Maintenance

**What it is:** A nozzle unit may need to be taken out of service temporarily for repairs or calibration.

**How the system handles it:** The manager can mark any nozzle as "Inactive — Under Maintenance." Once marked inactive:
- No new shift can be started on that nozzle.
- If a manager attempts to start a shift, the system shows: "Nozzle [X] is currently offline for maintenance. Please mark it as Active before starting a shift."
- Any open shift on that nozzle at the time it was marked inactive is not automatically closed — the manager must handle the open shift first (close it, or handle it through the normal flow). The system should warn the manager if they try to mark a nozzle inactive while it has an open shift.
- When the maintenance is complete, the manager marks the nozzle Active again and it becomes available for new shifts.

---

### 6.3 Underground Tank Taken Offline for Maintenance

**What it is:** An underground tank needs to be temporarily taken out of service — for example, a tank inspection, a structural repair, or a regulatory compliance check. The pump continues operating; only this specific tank is unavailable.

**How the system handles it:**

The Owner or Admin sets the tank's status to **INACTIVE** from the Setup page.

Once INACTIVE:
- **FIFO deduction skips this tank's lots.** All inventory lots belonging to the disabled tank are excluded from the pump-wide FIFO queue for that fuel type. Stock in those lots is frozen — it is not consumed by shift closes while the tank is offline. If other active tanks still have stock for the same fuel type, FIFO deduction continues from those tanks normally. If the disabled tank held the only remaining lots for a fuel type, shift closes for that fuel type will log an inventory shortage warning (Business Rule 10) but will still proceed — the shortage will surface as a DIP discrepancy when the tank is re-enabled.
- **New tanker deliveries to the INACTIVE tank are blocked.** The system shows: "Tank '[name]' is currently disabled. Re-enable it in Setup before recording a delivery."
- **DIP checks on the INACTIVE tank are blocked.** Physical measurements for a tank under maintenance are not recorded until the tank is returned to service.
- **The UI still shows INACTIVE tanks** (grayed out with a "Disabled" label and "(stock frozen)" indicator), so the Owner and Manager are always aware of disabled tanks and can re-enable them.

**Before disabling:** If the tank holds more than 5% of its configured capacity as current stock, the system shows a warning: "[X]% of stock will be frozen. Confirm?" This alerts the operator to frozen stock they may need to account for. The disable proceeds regardless — it is a confirmation step, not a hard block.

**Re-enabling:** The Owner or Admin sets the status back to ACTIVE. All previously frozen lots immediately re-enter the FIFO queue in their original delivery-date order. DIP checks and deliveries resume normally.

---

### 6.4 Credit Limit Breach

**What it is:** A credit customer's outstanding balance would exceed their approved credit limit if a new sale is added.

**How the system handles it:** When a credit sale is being logged and the new total would exceed the limit, the system displays a prominent warning with the exact numbers (current balance, new sale amount, credit limit, and how much over the limit the new balance would be). The manager can choose to override this warning — but must provide a written reason before the sale is saved. The operator cannot override independently. This override is logged and visible in reports and audit trails.

---

### 6.4 Wrong Global Fuel Sell Price Saved

**What it is:** An Admin or Manager saves an incorrect Global Fuel Sell Price (e.g., a typo like ₹10 instead of ₹100). If a shift then opens before the error is caught, that shift will snapshot and lock the wrong price for its entire duration.

**How the system handles it:** The 15% deviation check (Section 6.12 and Business Rule 37) fires at the moment the new global price is saved — before it takes effect — catching large typos before they can affect any shift. If the wrong price was confirmed through the warning and a shift has already opened with it, the Admin/Manager must immediately save a corrected Global Fuel Sell Price so that all subsequent shifts use the right price. The already-open shift's locked price **cannot be corrected** — it remains locked for the duration of that shift. The impact is limited to that one shift window. Because prices are maintained centrally rather than entered per-shift, this scenario affects at most one shift window rather than being a repeated risk at every individual shift open.

---

### 6.5 Duplicate Credit Bill Number

**What it is:** A credit sale is accidentally entered twice with the same bill number for the same customer.

**How the system handles it:** The system checks for bill number uniqueness per customer at the time of entry. If a duplicate is detected, the entry is rejected immediately with a clear message: "Bill number [XXXX] has already been logged for [Customer Name] on [Date]. If this is a different transaction, please use a different bill number." This prevents double-counting of credit sales in the shift total.

---

### 6.6 Discrepancy at Shift Close

**What it is:** The cash and digital payments submitted at handover do not match the calculated amount due.

**How the system handles it:** As detailed in Section 4.2, the shift cannot be silently closed with a discrepancy. The discrepancy amount (positive = short, negative = surplus) is displayed, the manager must provide a reason and select an initial resolution action before the shift can close. The discrepancy is immediately posted to the operator's Short/Over Sell Ledger (Section 3.11). It remains in "Pending" status until the manager completes the resolution (salary deduction applied, cash recovered, or explicitly waived). The manager and owner can always see the operator's cumulative outstanding short balance — it never disappears silently, even if an individual shift's discrepancy was acknowledged and closed.

---

### 6.7 Double Duty Tracking

**What it is:** The same operator works two consecutive 8-hour shifts.

**How the system handles it:** Each 8-hour block is an independent shift record with its own start/end readings, price snapshot, and payment breakdown. They happen to share the same operator and may share the same nozzle. The Operator Duty Report can display them as two separate shifts with a note that they were consecutive (double duty), and the daily balance sheet sums all shifts for that date regardless of how many shifts an operator worked.

---

### 6.8 Multiple Nozzles of the Same Fuel Type

**What it is:** A pump may have, for example, three nozzles each configured with Petrol and Diesel outlets, meaning six independent petrol/diesel meters are running simultaneously across the pump.

**How the system handles it:** Each nozzle and each outlet has independent records — shifts, readings, and calculations happen per outlet. When the daily balance sheet is generated, the system sums across all nozzles and outlets for each fuel type. For example, if Nozzle 1 (Petrol outlet) sold 800 litres, Nozzle 2 (Petrol outlet) sold 950 litres, and Nozzle 3 (Petrol outlet) sold 720 litres, the daily total for petrol is 2,470 litres. The breakdown by nozzle is always available for drill-down; the summary view shows the aggregate per fuel type.

---

### 6.9 Tanker Delivery During an Active Shift

**What it is:** A fuel tanker arrives and delivers fuel while one or more shifts are currently open.

**How the system handles it:** This is normal and allowed. The manager logs the delivery at any time. The inventory balance updates immediately. The delivery does not affect the pricing or calculations of any currently open shift — those shifts have their prices locked. The only effect is that the inventory balance increases, which is correct and expected.

---

### 6.10 Credit Customer with Multiple Vehicles

**What it is:** A single credit customer operates a fleet of vehicles and purchases fuel for multiple vehicles under the same account.

**How the system handles it:** The credit customer profile supports multiple vehicle numbers. When logging a credit sale, the operator or manager selects both the customer and the specific vehicle number. This allows the credit customer ledger to show a breakdown of sales per vehicle — useful for customers who need to allocate fuel costs across their fleet. The overall credit balance, credit limit, and billing cycle remain at the customer level, not the vehicle level.

---

### 6.11 Overdue / Unclosed Shift at Window Boundary

**What it is:** A shift is still open when its scheduled 8-hour window ends. For example, Shift 2 (8:00 AM–4:00 PM) is not closed by 4:00 PM. Shift 3 should now start, but the nozzle is still locked.

**How the system handles it:** At 4:00 PM (or the relevant window boundary), the system automatically marks any still-open shifts on that nozzle as **"Open — Overdue."** The Live Operations Dashboard (Section 7.2a) prominently highlights overdue shifts in red: "Nozzle [X] — Shift 2 is overdue."

Two outcomes are possible depending on how quickly the manager acts:

- **Manager closes the overdue shift manually:** The manager records the end reading and payment breakdown at the actual time of closing (e.g., 4:45 PM). The shift duration is recorded as the actual elapsed time. The balance sheet notes the overrun with the Overdue flag.

- **Next shift window start with no action taken:** If the nozzle is still in Overdue status when the manager attempts to open the next shift window (Shift 3 at 4:00 PM), the system **auto-closes the overdue shift at the window boundary** and marks it **"Auto-Closed — Overdue."** A new shift (Shift 3) can then be opened immediately on that nozzle — the nozzle is no longer locked. However, the auto-closed shift record is **incomplete**: the manager must still provide the actual end meter reading and payment breakdown before the operator's record is settled. Until the manager does this, the shift appears as "Auto-Closed — Overdue — Awaiting Reading" on the dashboard and the operator's account remains open. The system does not guess the end reading — only the manager can provide it.

In both cases, the Overdue flag is permanently recorded on the shift for audit and reporting purposes.

---

### 6.12 Fuel Price Spike Detection

**What it is:** An Admin or Manager saves a new Global Fuel Sell Price that is significantly different from the current price — e.g., ₹0, ₹5 (typo missing a digit), or ₹10,000. Any shift that opens after this will snapshot and lock the wrong price.

**How the system handles it:** When a new Global Fuel Sell Price is saved, the system checks it against the last recorded price for that fuel type at that pump. If the new price deviates by more than **15% in either direction**, the system shows a confirmation warning: "You are setting [Fuel Type] to ₹[X]. The last recorded price was ₹[Y]. This is a [Z]% change. Please confirm this is correct." The Admin/Manager must explicitly confirm. This is not a hard block — prices do genuinely change — but it prevents accidental typos from silently affecting all subsequent shifts. The check fires before the price is committed, so it intercepts the error before any shift can snapshot the wrong value.

---

### 6.14 Shift Opened After Its Scheduled Window

**What it is:** A manager opens Shift 2 at 11:00 AM instead of 8:00 AM, or opens Shift 1 at 2:00 AM. The shift starts within the window but later than the scheduled boundary.

**How the system handles it:** This is allowed. The manager selects the shift window (e.g., Shift 2) when opening the shift. The actual start time is recorded as the real clock time (11:00 AM). The shift is valid but has a shorter available duration than a full 8-hour block. The shift must still be closed before the window's scheduled end time (4:00 PM for Shift 2). Any fuel dispensed between 8:00 AM and 11:00 AM on that nozzle would not be under any shift — the nozzle shows "No Shift" in that gap on the dashboard. This is a legitimate operational state (nozzle unstaffed for part of the window). The daily balance sheet shows the actual start time for that shift row.

---

### 6.15 FIFO Lot Transition Mid-Shift-Close

**What it is:** When a shift closes with, say, 22,000 litres of petrol sold, and the oldest lot only has 20,000 litres remaining. The system needs to split the deduction across two lots automatically.

**How the system handles it:** This is fully automatic. The system deducts 20,000 litres from the oldest lot (exhausting it) and 2,000 litres from the next oldest lot. No manager action is required. The system records a Lot Consumption record for each lot touched: Lot A — 20,000 litres consumed (Lot A now Exhausted), Lot B — 2,000 litres consumed (Lot B has X remaining). The P&L then computes COGS from the exact mix of lots. The Inventory Lot Report (Section 7.9) shows this consumption breakdown clearly.

---

### 6.16 No Inventory Lots Available at Shift Close

**What it is:** A shift tries to close but there are no active Inventory Lots for the fuel type in question — either all lots were exhausted by previous shifts and no new tanker delivery has been logged, or the pump was never set up with an initial delivery.

**How the system handles it:** The system blocks the shift from closing and displays a hard error: "Cannot close shift — no Inventory Lots available for [Fuel Type]. Please log a tanker delivery to restore inventory records before closing this shift." The manager must log a retroactive tanker delivery (with correct cost price and delivery date) to create a new lot before the shift can close. If no delivery can be recorded (e.g., the physical stock was genuinely present but never logged), the manager must escalate to the owner. **The shift cannot be force-closed against empty lots** — doing so would produce a ₹0 COGS entry that silently corrupts all future P&L calculations.

---

### 6.17 Operator Deactivation with an Open Shift

**What it is:** A manager or owner attempts to deactivate an operator who currently has an open shift on a nozzle.

**How the system handles it:** The system blocks the deactivation and shows: "Operator [Name] has an open shift on Nozzle [X] (started at [time]). This shift must be closed before the operator can be deactivated." The manager must either: (a) close the shift normally through the standard handover flow, or (b) initiate a Partial Handover (Section 4.3) to transfer the nozzle to another operator. Only after the shift is closed (and all short balance discrepancies are resolved — see Business Rule 30) can the deactivation proceed.

---

### 6.13 Idle Nozzle for an Entire Shift Window or Day

**What it is:** A nozzle has no shift opened during a specific shift window (e.g., Nozzle 5 was not staffed during Shift 1) or for an entire day.

**How the system handles it:** This is a valid operational state — a pump may not staff every nozzle every shift. The Live Dashboard shows idle nozzles clearly (Status: "No Shift This Window"). The daily balance sheet shows a row for each nozzle per shift window; idle windows display "Not Staffed" rather than being omitted. This makes it immediately visible to the manager and owner when a nozzle is not being used, which is useful for staffing decisions and to distinguish from a case where a shift was accidentally never opened.

---

## 7. Reporting Specification

All reports are accessible via screen view and downloadable as PDF or Excel. Managers can access reports for their assigned pump(s) only. The Owner can access reports across all pump locations.

---

### 7.1 Shift Balance Sheet

**Purpose:** Provides a complete record of one 8-hour shift — what was sold, at what price, how much was collected, and whether it balanced.

**Scope:** One shift on one nozzle.

**Contents:**

- Header information: Pump location name, nozzle number and configured outlets, operator name, shift start time, shift end time, shift duration
- Per outlet / fuel type (one section per outlet configured on the nozzle — e.g., Petrol, Speed Diesel; or CNG):
  - Start meter reading
  - End meter reading
  - Units sold (litres for Petrol/Diesel, kg for CNG)
  - Snapshotted price per unit (₹/litre for Petrol/Diesel, ₹/kg for CNG — with label "Price locked at shift start")
  - Revenue from this fuel type
- Total Amount Due (sum of all fuel revenues)
- Payment Breakdown:
  - Cash collected
  - UPI collected (separate from Card)
  - Card collected (separate from UPI)
  - Credit Total (sum of all credit sales in this shift)
  - Grand Total Collected (Cash + UPI + Card + Credit)
- Discrepancy line: Amount (₹X short / ₹X surplus, or "Balanced")
- Discrepancy reason (if applicable)
- Credit Sales Detail (table):
  - Customer name | Vehicle number | Fuel type | Quantity (L / kg) | Amount | Bill number | Time of sale
- Signature/acknowledgement line (for printed version): Manager and Operator

---

### 7.2 Live Operations Dashboard + Daily Balance Sheet

#### 7.2a Live Operations Dashboard

**Purpose:** A real-time view of the current operational status of the pump — which nozzles are active right now, which shifts are open, and what the running totals look like. This is the screen the manager keeps open throughout the day.

**Scope:** Current day, all nozzles, one pump location.

**Contents (auto-refreshing):**
- Per nozzle: Nozzle number | Operator name | Shift window | Status (Open / Closed / Idle) | Current shift start reading | Running estimated litres sold (if readable) | Time elapsed
- Running totals for the day so far: estimated litres sold (from closed shifts only), estimated revenue (from closed shifts only)
- Shifts still open: highlighted separately — "X shifts in progress"
- Any shifts with discrepancies pending resolution: flagged in red

This dashboard does not replace the formal Daily Balance Sheet — it is a live operational view, not a financial record.

#### 7.2b Daily Balance Sheet

**Purpose:** Gives a complete, final financial picture of one calendar day across all nozzles at a pump location.

**Scope:** All shifts on all nozzles at one pump, for one calendar day (all 3 shift windows: 12:00 AM–12:00 AM).

**Behaviour when shifts are still open:** If the daily balance sheet is generated while one or more shifts are still open, the report shows those shifts with an "In Progress" label and includes only their start readings. Totals are marked as "Partial — [N] shifts still open." The report is considered final only when all 3 shift windows for the day are closed.

**Contents:**

- Header: Pump location, date, report status (Final / Partial — X shifts open)
- Shift Summary Table (one row per shift window per nozzle):
  - Nozzle number | Operator | Shift window | Start time | End time | Status (Balanced / Discrepancy Noted / **In Progress**)
- Per Fuel Type Summary (from closed shifts only, with note if partial):
  - Total units sold (litres for Petrol/Diesel; kg for CNG) across all nozzles for this fuel type
  - Total revenue for this fuel type
- Payment Totals for the Day:
  - Total Cash collected
  - Total UPI collected (separate line)
  - Total Card collected (separate line)
  - Total Digital collected (UPI + Card combined — for quick reference)
  - Total Credit Sales
  - Total Revenue
- Discrepancy Summary:
  - Total number of shifts with discrepancies
  - Total net discrepancy amount for the day
- Inventory Section (per underground tank, grouped by fuel type):
  - Tank name and fuel type
  - Opening stock (start of day — the previous day's DIP reading. If no DIP reading exists for the previous day — for example, on the pump's very first day of operation or if yesterday's DIP was not recorded — the opening stock falls back to the system-calculated balance at the start of the day, clearly labelled "System Calculated — No DIP Reading Available")
  - Deliveries received during the day into this tank (from tanker delivery logs)
  - Total units sold via nozzles connected to this tank (from closed shifts)
  - DIP correction applied for the day (from the daily DIP check, if a variance was recorded)
  - Closing stock (from the last DIP reading of the day for this tank)
  - System-calculated balance vs DIP-measured balance (to highlight any remaining variance)

---

### 7.3 Custom Date Range Report

**Purpose:** Allows the owner or manager to analyse performance over any chosen period — a week, a fortnight, a month, or any custom range.

**Scope:** Aggregated across the selected date range, with optional filters.

**Filters available:**
- Pump location (owner can select specific pump or all pumps)
- Date range (start and end date)
- Fuel type (Petrol only, Diesel only, CNG only, or all)
- Operator (filter by specific operator)
- Payment type (Cash only, UPI only, Card only, Credit only, or all)

**Contents:**

- Aggregated equivalents of the Daily Balance Sheet structure across the date range
- Day-by-day breakdown table (one row per day) for trend visibility
- Totals at the bottom for the entire period

---

### 7.4 Profit / Loss Statement

**Purpose:** Shows whether the pump is making money, by comparing revenue against the cost of fuel purchased.

**Scope:** Selectable — per shift, per day, or any custom date range. Accessible by Manager (own pump) and Owner (all pumps).

**Contents:**

- Revenue Section:
  - Total Cash collected
  - Total UPI collected (separate line)
  - Total Card collected (separate line)
  - Total Credit Sales (the value of fuel sold on credit in this period — revenue is recognised at the point of sale, not at the point of payment. Credit sales are included in P&L even if the customer has not yet paid.)
  - **Total Revenue = Cash + UPI + Card + Credit Sales**

  **Why accrual-based:** The P&L shows the full commercial value of fuel sold in the period, regardless of how it was paid for. Cash and digital payments are received immediately; credit sales are revenue earned but collected later. This gives an accurate picture of sales performance. Cash flow (when credit payments are actually received) is tracked separately in the Credit Customer Ledger (Section 7.5).

- Cost of Fuel Section (FIFO lot-based):
  - The system uses FIFO costing via Inventory Lots (Section 3.9a). Each shift close deducts litres from the oldest lot first. The P&L report shows the COGS based on the exact lot(s) consumed during the period.
  - Per fuel type breakdown:
    - Lot reference | Delivery date | Cost price/unit | Units consumed from this lot | Cost
  - Example: 22,000 litres of petrol sold. Lot A (20,000L at ₹80) fully consumed + 2,000L from Lot B (₹85). COGS = ₹1,600,000 + ₹170,000 = ₹1,770,000.
  - **Note on sell price vs cost price:** The sell price (Global Fuel Sell Price snapshotted at shift open) determines **revenue**. The cost price (from tanker delivery lots) determines **COGS**. These are two completely independent values. A shift may sell petrol at ₹103/L (revenue side) while the petrol in the tank cost ₹80/L (cost side). Gross profit = sell price − cost price per litre.
  - **Total Cost of Fuel Sold (COGS)**

- Gross Profit = Total Revenue − Total Cost of Fuel Sold
- Per-litre gross margin per fuel type shown for quick reference

- Note: Version 1 does not include operating expenses (salaries, maintenance, electricity). Gross Profit is therefore the profit from fuel sales only, before operating costs. This is noted clearly on the report.

---

### 7.5 Credit Customer Ledger

**Purpose:** A complete transaction history for a specific credit customer, showing all sales, all payments, interest charges, and the current outstanding balance.

**Scope:** One credit customer, selectable date range or billing cycle.

**Contents:**

- Customer profile summary: Name, contact, vehicle numbers, credit limit, billing cycle, interest rate (%), interest period (Weekly / Monthly)
- Transaction History (chronological table):
  - Date | Type (Sale / Payment / **Interest Charge**) | Description (bill number, payment reference, or interest period) | Vehicle | Fuel | Quantity (L / kg) | Amount | Running Balance
  - Interest Charge rows are visually distinct (e.g., italic or different row colour) so they are easy to identify
- Outstanding Balance (prominently displayed), broken down as:
  - Principal Outstanding (unpaid sales)
  - Interest Outstanding (unpaid interest charges)
  - **Total Outstanding = Principal + Interest**
- Overdue amount (if any bills have exceeded the billing cycle end date without payment — highlighted in red)
- Billing Statement for a Cycle: When the manager selects a specific billing cycle (e.g., March 1–31), the report shows only the transactions within that cycle — sales, payments, and interest charges — and the closing balance owed. Formatted as a clean statement suitable for sharing with the customer.

---

### 7.6 Operator Duty Report

**Purpose:** A performance and accountability summary for each operator — how many shifts they worked, how much they sold, and whether they had any discrepancies.

**Scope:** One operator, selectable date range.

**Contents:**

- Operator name and details
- Summary Table (one row per shift):
  - Date | Nozzle | Start time | End time | Total units sold | Total revenue | Cash collected | UPI collected | Card collected | Credit | Discrepancy amount | Discrepancy type (Short/Over) | Resolution status
- Totals row at the bottom: Total shifts, total units, total revenue, total short amount, total over amount
- Discrepancy History: Highlighted list of all shifts with discrepancies, with reasons and resolution actions, for management review

---

### 7.7 Operator Short/Over Sell Report

**Purpose:** Dedicated accountability report showing the full discrepancy history and outstanding balance for one or all operators. This is the primary tool for the owner/manager to track how much money is outstanding from operators and how it is being recovered.

**Scope:** One operator or all operators at a pump, selectable date range.

**Contents:**

- **Per Operator Summary (for all-operators view):**
  - Operator name | Total short discrepancies (count) | Total short amount | Total recovered (salary + cash) | Total waived | **Outstanding short balance**
  - Sorted by outstanding balance descending so the highest-risk operators are visible immediately

- **Per Operator Detailed View:**
  - Operator name and employment details
  - **Outstanding Balance (prominently displayed):** Total amount still owed by this operator
  - Discrepancy History Table (one row per discrepancy):
    - Shift date | Nozzle | Discrepancy amount | Type (Short/Over) | Manager's reason | Resolution action | Amount resolved so far | Remaining outstanding | Resolution date (if fully resolved)
  - Recovery History: All cash payments and salary deductions logged against this operator, with dates and amounts
  - Waiver History: All waived discrepancies with reasons

- **Filter options:** Show All / Show Only Pending / Show Only Resolved / Show Only Waived

---

### 7.8 Interest Accrual Detail Report

**Purpose:** Provides a transparent, per-purchase breakdown of how interest was calculated for a credit customer. Essential for customer disputes and manager verification.

**Scope:** One credit customer, selectable date range or billing cycle.

**Contents:**

- Customer profile: name, interest rate (%), interest period
- Per credit sale row:
  - Bill number | Purchase date | Principal amount | Interest period start | Interest period end | Carried-forward unpaid interest from previous period | Base for calculation (principal + carry-forward) | Interest rate (%) | Interest charged this period | Cumulative interest charged to date
- Total interest charged in selected period
- Total unpaid interest outstanding
- Comparison: what customer would owe if all interest had been paid on time vs actual compounded amount (helps illustrate the compound effect clearly)

---

### 7.9 Inventory Lot Report

**Purpose:** Shows the current inventory broken down by tanker delivery lot, with cost prices. This is the authoritative source for verifying FIFO P&L calculations.

**Scope:** One pump location, one tank (or all tanks), current state (or as of a specific date).

**Contents:**

- Per underground tank section (grouped by fuel type):
  - Tank name and fuel type
  - Per lot row: Tanker reference | Delivery date | Original quantity | **Remaining quantity** | Cost price per unit (₹/litre or ₹/kg for CNG) | Total cost value of remaining stock | Status (Active / Exhausted)
  - DIP Correction rows (if any): Date | System balance | DIP reading | Correction amount | Reason
  - Lots ordered oldest to newest (FIFO order)
- Per-tank summary row: Total remaining quantity | Weighted average cost price across all active lots | Total inventory value at cost
- Cross-tank summary (per fuel type): Aggregated totals across all tanks of the same fuel type

**Why this matters:** The P&L Gross Profit figure is only trustworthy if the lot consumption is correct. This report allows the owner or manager to audit: "We sold 22,000 litres of petrol. Lot A (₹80) is exhausted and Lot B has 13,000 litres remaining — that's consistent with 20,000 from Lot A and 2,000 from Lot B being sold."

---

## 8. Future Enhancements

The following features are out of scope for the current version. They are documented here so the development team can make architectural decisions that do not close the door on these enhancements in later phases.

> **Already Implemented (moved from this list):**
> - Expense tracking and approval workflow — now in Section 3.16 and Section 4.13
> - Shift planning and staff scheduling — now in Section 4.14
> - Ancillary (counter) product sales and FIFO inventory — now in Section 3.17 and Section 4.15
> - Payroll generation for operators and managers — now in Section 3.18 and Section 4.16
> - Nozzle calibration compliance logging — now in Section 3.19 and Section 4.17
> - In-app notification system — now in Section 3.20
> - Credit customer self-service balance portal (public, unauthenticated — pump ID + phone number lookup)
> - Low stock in-app alerts (fuel and ancillary) via notification system

1. **Operator Self-Login with Liveness Check:** Currently, operators do not log into the system themselves — the manager acts on their behalf for shift opening and can close shifts, while the operator submits the payment breakdown. In a future version, operators will have their own mobile app login with a liveness check (real-time photo verification) to prove they are physically present at the pump at shift start. This improves accountability at high-volume pumps.

2. **POS Terminal Integration for UPI/Card Payments:** Currently, digital payment amounts are entered manually by the operator. In a future version, the system will integrate with POS terminals (card machines / QR code payment devices) to automatically pull the total digital payments collected during a shift. This eliminates manual entry errors and reduces reconciliation discrepancies.

3. **Fuel Company API Integration for Automated Price Updates:** Fuel prices in India are updated daily by oil marketing companies. The system currently requires the Admin/Manager to manually update the Global Fuel Sell Price. In a future version, an integration with the relevant fuel company API will push price updates directly into the Global Fuel Sell Price record automatically. The system will still enforce the 15% deviation guard and require confirmation for any change.

4. **Automated SMS/WhatsApp Billing for Credit Customers:** At the end of each billing cycle, the system will automatically generate and send a billing statement to the credit customer via SMS or WhatsApp. This replaces the current manual generation and download process.

5. **Full P&L with Expense-Based Net Profit:** The current P&L covers gross profit from fuel sales only. Approved pump expenses (Section 3.16) feed into the balance sheet, but a dedicated full net P&L statement — with expense category breakdowns and operating cost trends — is planned as a reporting enhancement.

6. **Loyalty/Points System for Regular Customers:** A rewards programme where regular (non-credit) retail customers can accumulate points based on fuel purchased and redeem them for discounts. This is a customer retention feature entirely separate from the credit customer system.

7. **OAuth / SSO Authentication:** Password-based login is used in the current version. A future version will support OAuth 2.0 / enterprise SSO (e.g., Google) for improved security and a passwordless experience. The migration must be non-breaking for existing password credentials.

8. **PDF/Excel Report Export:** Report download as PDF or Excel is planned but not yet implemented. On-screen display is available. Export will be capped at 6 months per export (see Q18 resolution).

9. **Mobile App for Nozzle Operators:** A dedicated mobile experience with a simplified shift handover interface and credit sale logging for nozzle operators. Currently the web app is the primary interface for all roles.

---

## 9. Open Questions

The following questions need resolution with stakeholders before the final specification can be locked and development begins.

---

~~**Q1: Should a Nozzle Operator be able to view their own historical shift reports?**~~
*Resolved (v1.5):* No. Operators can only see their currently active shift. No historical shift visibility for operators. See Section 2 Notes on Scope.

---

~~**Q2: For UPI + Card payments — combined or separate buckets?**~~
*Resolved (v1.5):* Separate. UPI and Card are distinct fields in the shift payment breakdown, daily balance sheet, and all reports. See Section 3.5, Section 4.2, Section 7.1, Section 7.2b, and Business Rule 52.

---

~~**Q3: How should post-close corrections be handled for wrong meter readings?**~~
*Resolved (v1.5):* Only the Owner can correct a post-close meter reading. The owner creates an audit-logged Meter Reading Amendment with the original reading, corrected reading, and a mandatory reason. All shift calculations are recomputed and the amendment is permanently marked on the shift record. Managers and Admins cannot perform this correction. See Business Rule 53.

---

~~**Q4: Should the billing cycle lock new credit sales when overdue?**~~
*Resolved (v1.5):* Yes — hard block. If a customer's previous billing cycle has ended with an outstanding unpaid balance, all new credit sales are blocked until the overdue balance is fully settled. Only the owner can override this block. See Section 4.5 and Business Rule 51.

---

~~**Q5: What is the maximum nozzle count per pump — fixed at 9 or configurable?**~~
*Resolved (v1.3):* Maximum nozzle count is configurable by the owner at pump setup. It can be increased by the owner if new physical nozzles are installed. See Section 3.2 and Business Rule 40.

---

~~**Q6: For interest calculation — on what date does the interest period start for a new customer?**~~
*Resolved (v1.5):* First period starts on purchase date. Weekly periods end on Monday; monthly periods end on the 1st of the next month. First period interest is pro-rated by days. See Section 4.11, Step 2, and Business Rule (in Section 5 context via Section 3.12).

---

~~**Q7: What is the Admin role's exact scope vs Manager?**~~
*Resolved (v1.5):* Admin is a "senior manager with correction authority." Admin has all Manager capabilities plus the ability to perform manual stock corrections (DIP adjustments above tolerance), credit interest adjustments, and can assist the owner in meter reading amendments. See Section 2 role definitions and Business Rules 54.

---

~~**Q8: Interest first period — full period or pro-rated?**~~
*Resolved (v1.5):* Pro-rated. The first partial period's interest is calculated as: `Principal × Rate × (Days in Period / Full Period Days)`. From the second period onwards, the full rate applies. See Section 4.11, Step 2 and the worked example.

---

~~**Q9: Interest settlement order — interest before principal, or FIFO across all?**~~
*Resolved (v1.5):* Strict chronological FIFO across all charge types. The oldest outstanding charge — whether a principal sale or an interest charge — is settled first. There is no separate "interest-first" priority. See Section 4.6, Section 3.12, and Business Rule 55.

---

~~**Q10: Can a person have more than one role over time (role history)?**~~
*Resolved (v1.5):* No promotions or role changes within the system. An operator is always an operator. If a real-world promotion happens, the old profile is deactivated and a new profile is created for the new role. The two profiles are separate with no system linkage. See Business Rule 57.

---

~~**Q11: If the wrong sell price is entered at shift start — who can correct it and how?**~~
*Resolved (v1.7):* The pricing model has been fundamentally changed to eliminate this risk at source. Prices are no longer manually entered at each shift open. Instead, a **Global Fuel Sell Price** is maintained centrally per fuel type by Admin/Manager (see Section 3.4). When a shift opens, the system automatically snapshots the current global price — the manager sees it displayed and confirms, but does not type it. If the displayed global price is wrong, the manager exits, fixes the global price first, then opens the shift.

The 15% deviation guard (Business Rule 37 and Section 6.12) now fires when the global price itself is saved — before it can affect any shift. This intercepts errors at the point of data entry rather than at shift open.

If a shift has already opened with a wrong global price that was confirmed past the warning: the Admin/Manager immediately saves a corrected global price so all subsequent shifts use the right value. The locked shift's price **cannot be retroactively changed** — it remains locked for its duration. The impact is contained to at most one shift window.

---

~~**Q12: How does a credit customer get linked to a specific pump?**~~
*Resolved (v1.9):* The Admin (or Owner) at a pump manually links an owner-level credit customer to their pump. Once linked, the association is permanent — customers cannot be unlinked as historical transaction records are tied to this relationship. Customers can be effectively deactivated at a pump by setting their credit limit to 0. See Section 3.6 and the Section 2 capability table.

---

~~**Q13: What happens if no Global Fuel Sell Price exists when a shift is opened?**~~
*Resolved (v1.9):* This will not occur in normal operation — the Global Fuel Sell Price persists indefinitely once set (yesterday's price applies if not updated today). On a brand-new pump where no price has ever been entered, the system blocks shift opening and prompts the Admin/Manager to set the initial price first. See Section 3.4.

---

~~**Q14: Auto-closed overdue shift — what end reading does the system use?**~~
*Resolved (v1.9):* The system does not guess the end reading. Auto-closing the shift at the window boundary only changes the shift status and unblocks the nozzle for the next shift. The manager must still provide the actual end meter reading and payment breakdown — until they do, the record shows "Auto-Closed — Overdue — Awaiting Reading." The nozzle is available for new shifts immediately after auto-close. See Section 6.11 and Section 3.5.

---

~~**Q15: Can a credit sale be voided on an open (not yet closed) shift?**~~
*Resolved (v1.9):* Yes. The operator who logged the credit sale or the manager can void it while the shift is still open. A mandatory written reason is required. The voided record is retained in the audit log with a "Voided" flag — it does not disappear. The shift's credit total updates immediately. Once the shift closes, credit sales become immutable. See Business Rule 7.

---

~~**Q16: In the P&L report, what does "Credit Settled" include?**~~
*Resolved (v1.9):* The P&L uses sell-based (accrual) accounting. Revenue = Cash + UPI + Card + Credit Sales (value of fuel sold, regardless of whether credit has been collected). Credit sales are recognised as revenue at the point of sale. Cash flow (when credit is actually received) is tracked separately in the Credit Customer Ledger. The term "Credit Settled" has been removed from Section 7.4 — it now correctly shows "Credit Sales." See Section 7.4.

---

~~**Q17: What is the authentication model for each role?**~~
*Resolved (v2.1):* **Password-based authentication** is used in Version 1. Login identifier is phone number + password. OAuth-based authentication (e.g., Google, enterprise SSO) is planned for a future version but is out of scope for v1. Session model (JWT lifetime, refresh token strategy, multi-device behaviour) is an engineering implementation decision — no product constraints specified beyond password-based login. Future OAuth migration must be designed to be non-breaking for existing password credentials.

---

~~**Q18: What is the report pagination and export size strategy?**~~
*Resolved (v2.1):* **Default page size is 100 rows** for all on-screen report views. **PDF/Excel export is capped at 6 months** — users cannot select a date range greater than 6 months for export. If more than 6 months of data is needed, the user must generate multiple exports. These limits apply uniformly across all report types (Shift Balance Sheet, Daily Balance Sheet, Custom Date Range, P&L, Credit Ledger, Operator Duty, Inventory Lot). The system must validate the date range on the export request and return a clear error if it exceeds 6 months: "Export range cannot exceed 6 months. Please narrow your date selection."

---

~~**Q19: Scheduled jobs — what are the timezone, failure, and retry requirements?**~~
*Resolved (v2.1):* All scheduled jobs run in **IST (Asia/Kolkata, UTC+5:30)**. Jobs are scheduled to run in the **1:00 AM – 6:00 AM IST window** — the low-customer period at petrol pumps. The exact job schedule within this window is an engineering implementation decision.

Three jobs implied by the spec are now formally defined:

1. **Interest calculation job** — runs at 1:00 AM IST on Monday (for weekly-period customers) and on the 1st of each month (for monthly-period customers). Stages interest charges as "Pending Confirmation" — does not auto-post. Must be idempotent: if the job runs twice for the same period, the second run must detect that interest for that period is already staged and skip, not duplicate.

2. **Auto-close overdue shift job** — runs at 12:00 AM, 8:00 AM, and 4:00 PM IST (the three window boundaries). Marks any still-open shifts as "Auto-Closed — Overdue — Awaiting Reading." Must be idempotent: auto-closing an already auto-closed shift must be a no-op.

3. **DIP Pending flag** — refreshed continuously as part of the Live Operations Dashboard query (not a scheduled job). Any tank with no DIP reading for the current calendar day is flagged "DIP Pending" in real time.

**Engineering requirements for all jobs:** Each job must use a distributed lock (e.g., database-level advisory lock or a dedicated job lock table) to prevent concurrent execution across multiple server instances. A failed job run must not silently disappear — job failures must be logged to an observable errors table or monitoring system so the owner/admin can be alerted and the job can be manually re-triggered if needed.

---

~~**Q20: Manual bill-wise settlement — what happens to outstanding interest on bypassed charges?**~~
*Resolved (v2.1):* **Yes — interest continues to compound on bypassed older bills.** If a manager uses manual bill-wise settlement to pay Bill 125 while Bill 101 (older, with outstanding interest) remains unpaid, Bill 101's interest base for the next period includes the unpaid interest from this period. The compound interest model (Business Rule 21, Section 3.12) applies regardless of which bills were manually settled. The system must display a **warning** during manual settlement: "You are settling Bill [X] while older bills remain outstanding. Interest will continue to accrue on the bypassed older bills." The manager must acknowledge this warning before proceeding. This warning is informational — it does not block the settlement.

---

~~**Q21: Retroactive end reading for an auto-closed shift — what constraints apply?**~~
*Resolved (v2.1):* Auto-close records the shift end time as the **scheduled window boundary** (e.g., 4:00 PM for Shift 2). The auto-closed shift is complete as of that timestamp — the operator is not permitted to work past their shift window. If an operator works beyond the window boundary (overtime), the manager must open a **new shift** for that operator for the next window. The retroactive reading the manager provides is the meter reading at the scheduled window end time — not the reading at the time the manager enters it. No upper-bound conflict with the next shift's start reading should arise because the next shift's start reading is taken at the same window boundary point. Standard validation applies (reading must be ≥ shift start reading; rollover warning if lower). No system-enforced deadline for providing the retroactive reading — the manager is expected to enter it promptly. The shift record remains "Auto-Closed — Overdue — Awaiting Reading" until the reading is provided.

---

~~**Q22: Tanker delivery invoice reference — is uniqueness enforced?**~~
*Resolved (v2.1):* The tanker invoice reference field is **mandatory** — every tanker delivery record must include an invoice or tanker reference number for audit trail completeness. **No system-enforced uniqueness constraint** is applied — suppliers may reuse invoice numbering schemes and the system should not block valid deliveries on that basis. The field is stored as-is for record-keeping and audit purposes. The manager is responsible for ensuring the reference accurately reflects the physical delivery document.

---

~~**Q23: Retroactive tanker delivery date — does it re-sort the FIFO queue?**~~
*Resolved (v2.3):* **Option A — no retroactive re-sorting.** When a delivery is logged with a past date, the Inventory Lot enters the FIFO queue at the position corresponding to **today** (the date it was actually logged in the system), not the entered past date. The entered delivery date is stored for reference and audit only. Historical P&L and already-closed shift COGS are not recalculated. The system displays a warning when a past delivery date is entered: "This delivery date is in the past. The lot will be added to the inventory queue as of today and will not affect already-closed shift COGS calculations. The entered delivery date is stored for reference only."

---

~~**Q24: Owner updating Global Fuel Sell Price — which pump does it apply to?**~~
*Resolved (v2.3):* **Pump-by-pump.** Every pump location has different retail prices, so the Owner must explicitly select which pump they are updating the price for — there is no bulk cross-pump update. When the Owner navigates to the fuel price section, they first select the pump location, then update the price for that pump. **Admin can also update the Global Fuel Sell Price** for their assigned pump (already reflected in Section 2 capability table). This aligns with the existing pump-scoped model for all other operational actions.

---

*End of Document*

---

**Document Owner:** To be assigned
**Next Review:** To be scheduled with product, engineering, and business stakeholders
**Version History:**

| Version | Date | Author | Notes |
|---|---|---|---|
| 1.0 | 31 March 2026 | — | Initial draft based on requirements brief |
| 1.1 | 31 March 2026 | — | Added short/over sell tracking + credit customer interest |
| 1.2 | 31 March 2026 | — | Edge case review: shift duration corrected to 8hrs/3 shifts, FIFO P&L, start reading validation, physical stock reconciliation, owner-level credit customers, fixed shift windows, 9 new business rules, live dashboard, updated open questions |
| 1.3 | 31 March 2026 | — | Employee model for all 4 roles (ID/name/phone/address), Admin role added, CNG unit=kg, compound interest per-purchase-date, Inventory Lot entity for FIFO, max nozzle count at config, 8 new business rules, 3 new edge cases (overdue shift, price spike, idle nozzle), 2 new reports (Interest Accrual Detail, Inventory Lot Report), 4 new open questions |
| 1.4 | 31 March 2026 | — | Edge case review: sell price vs cost price clarified (Section 3.4), inventory lots per fuel type, dual nozzle fuel type selection, bill number all-time uniqueness, operator deactivation rules, shift timing flexibility, per-pump interest confirmation, FIFO stock adjustment, 8 new business rules (42–49), 4 new edge cases (6.14–6.17), Q5 and Q6 resolved |
| 1.5 | 31 March 2026 | — | All open questions resolved: Underground Tank entity (Section 3.13), daily DIP check per tank (Section 4.12 rewritten), UPI/Card split into separate fields, Admin = senior manager with correction authority, operator historical reports denied, pro-rated first interest period, FIFO interest settlement across all types, overdue billing cycle blocks credit sales, owner-only meter reading correction, no role promotions, 8 new business rules (50–57) |
| 1.9 | 31 March 2026 | — | Q12–Q16 all resolved: credit customer pump linking (Admin/Owner links; permanent; Section 3.6 + capability table updated), no-price-on-new-pump blocking (Section 3.4), auto-close overdue shift requires manager end reading (Section 6.11 + 3.5 updated), credit sale void on open shift by operator or manager (Rule 7 rewritten), P&L changed from cash-received basis to sell-based accrual — Revenue = Cash + UPI + Card + Credit Sales (Section 7.4 rewritten). Stale open-question references and "to be defined" notes removed throughout. |
| 1.8 | 31 March 2026 | — | Review pass: Section 4.12 Step 6 "shift reference" removed from DIP Correction fields, Section 3.5 "Auto-Closed — Overdue" status added to shift status enum, Section 3.2 pump-per-manager/admin corrected (exactly one Manager + at most one Admin), Section 7.5 "Litres" column → "Quantity (L/kg)", Section 4.12 Step 5 two-threshold inconsistency resolved (single configured tolerance, Admin/Owner confirm above it — aligned with Rule 54), Rule 7 updated (credit sale correction process clarified; open-shift voids allowed; closed-shift immutable with compensating entry), Section 4.11 Step 5 updated (Admin can also confirm interest, not just Manager), Section 7.2b Per Fuel Type Summary unit label fixed (litres/kg), Section 6.1 Planned Meter Reset aligned to Section 3.14 (no separate entity), Rule 53 clarified (data correction vs physical hardware event — different scenarios), Q12–Q16 added (credit customer pump linking, no price on new pump, auto-close end reading, open-shift credit sale void, P&L Credit Settled definition) |
| 1.7 | 31 March 2026 | — | Pricing model redesigned: Global Fuel Sell Price entity introduced (Section 3.4 rewritten) — prices no longer manually entered at shift start, Admin/Manager maintain a central rate that shifts auto-snapshot at open. Section 4.1 Step 5 updated (price display/confirm, not entry). Business Rules 2, 15, 37 updated. Section 6.4 and 6.12 updated. Section 2 capability table updated (global price management row). Section 1 Manager description updated. Q11 resolved. Meter Reading Amendment entity added (Section 3.14) — covers physical nozzle hardware events requiring meter reset/adjustment, Owner-only, full audit record. |
| 1.6 | 31 March 2026 | — | Comprehensive review pass: Section 1 updated (four roles, Admin in problem list), Section 2 capability table expanded (DIP, tank config, meter correction, overdue override), Section 3.0 one pump per role clarified, Section 3.5 "Open — Overdue" status added, Rule 22 corrected (Owner-only interest rate change), Rule 38 corrected (removed interest-first priority — strict FIFO per Rule 55), Rule 10 cross-referenced Rule 48, Rule 13 updated (underground tanks in owner config scope), Rule 42 rewritten (FIFO per tank not per fuel type), Rule 46 and 54 renamed to "DIP Correction" (consistent naming), Section 4.2 formula corrected (UPI + Card not UPI/Card), Section 4.4 example shift times corrected, Section 4.11 pro-rated period boundary fixed (Monday not Sunday), Section 4.12 DIP frequency corrected (daily not per-shift), Section 6.11 overdue shift reconciled (auto-close + manual-close both documented), Section 7.1 CNG unit labels (kg not litres), Section 7.3 UPI and Card filters split, Section 7.4 revenue section split UPI/Card, Section 7.5 interest period label (Weekly/Monthly) added, Section 7.6 UPI/Card column split, Section 7.9 DIP Correction rows use Date not Shift reference, Daily Balance Sheet opening stock phrasing updated, Q11 added (sell price correction process — open) |
| 2.0 | 31 March 2026 | — | Engineering review pass: Rule 27 DB constraint added, Rule 48 zero-sale exception added, Section 3.14 Meter/Fuel Type field added, Section 3.7 shift_id + void status added, Section 3.9a Lot Consumption record defined, Section 4.12 upward DIP correction lot mechanism clarified, Rule 11 synchronous balance update clarified, open questions Q17–Q22 added |
| 2.1 | 31 March 2026 | — | Q17–Q22 all resolved: password-based auth (OAuth future), 100-row pagination / 6-month export cap, scheduled jobs IST 1AM–6AM window with idempotency and distributed lock requirements, interest compounds on bypassed bills in manual settlement, auto-closed shift end reading = window boundary (overtime requires new shift), tanker invoice reference mandatory but no uniqueness constraint |
| 2.2 | 31 March 2026 | — | Engineering review pass 2: Section 3.0 password hash field added, Section 3.3 nozzle fields + maximum meter value formalised, Section 3.4 pump reference added to Global Fuel Sell Price fields, Section 3.6 Credit Customer–Pump Link sub-entity defined + pump-level suspension vs global deactivation clarified, Section 3.8 logged_by + pump reference + payment mode enum added, Section 3.9 logged_by + delivery date note added, Section 3.15 DIP Correction entity added, Section 4.1 shift window timing validation added, Section 7.2b opening stock fallback defined, Q23 (retroactive delivery date FIFO impact) and Q24 (Owner pump selector for price update) added |
| 2.3 | 31 March 2026 | — | Q23 + Q24 resolved. Credit Extension model added: Admin or Owner can grant temporary credit limit extensions, billing cycle extensions, or overdue block waivers (pump-scoped, mandatory expiry, one active extension per type). Business Rules 58–60 added. Rule 51 updated (Admin + Owner can override overdue block). Rule 22 updated (Admin can grant extensions; Owner only for permanent limit). Section 2 capability table updated (split credit limit rows; overdue block override now Admin + Owner). Section 4.5 overdue block warning updated. |
| 3.0 | 31 March 2026 | — | Major redesign: (1) Nozzle outlet model — replaced fixed DUAL/CNG type with flexible per-outlet model supporting all 5 fuel types (PETROL, SPEED_PETROL, DIESEL, SPEED_DIESEL, CNG); Section 3.3 fully rewritten with fuel type table, outlet record fields, CNG mixing rule, and tank assignment explanation. (2) FIFO scope change — FIFO is now per pump + fuel type (not per tank); Section 3.9a "Critical" paragraph, Section 3.10, and Rule 42 fully updated. (3) Explicit tank creation — tanks are now created manually by the owner (not auto-created with nozzles); Section 3.13 updated. (4) Tank INACTIVE status — new ACTIVE/INACTIVE/DECOMMISSIONED status model for underground tanks; Section 3.13 expanded with disable/enable rules, FIFO exclusion, delivery/DIP block; Business Rules 61–64 added; Section 6.3 (new edge case) added. (5) 5 fuel type rules — Business Rules 65–66 added for fuel type validation and CNG mixing enforcement. (6) Shift flows updated — Section 4.1 steps 5–6 and example, Section 4.2 steps 2–3, Section 4.5 step 4 all updated for outlet-based readings and multi-outlet nozzle terminology. (7) Section 3.4 fuel type field updated; Section 3.7 credit sale fuel type updated; Section 3.14 outlet/fuel type field updated; Section 6.8 updated for outlet model; Section 7.1 header updated. |
| 4.0 | 7 April 2026 | — | Synced spec with implemented codebase. (1) Accountant role added — Section 2 capability table and role definitions updated. (2) Dynamic shift definitions — Section 3.5 Shift updated to reference PumpShiftDefinition (Section 3.16b) instead of hardcoded 3-window enum; Business Rule 26 updated; end-time exclusivity and isNightShift flag documented. (3) New entities added — Section 3.16 PumpExpense (categories, approval workflow, auto-approval threshold), Section 3.16b PumpShiftDefinition (configurable windows, overlap rule, end-time exclusivity), Section 3.17 AncillaryProduct (FIFO lot tracking, per-product GST, AncillarySale, AncillaryLotConsumption), Section 3.18 PayrollRecord (HOURLY_SHIFT and DAILY models, rate snapshots, leave integration, deduction linkage), Section 3.19 NozzleCalibrationLog (calibration enforcement on shift open, certificate tracking), Section 3.20 Notification (9 notification types, lazy generation, dedup_key). (4) New system flows added — Section 4.13 Expense Recording and Approval, Section 4.14 Shift Planning, Section 4.15 Ancillary Product Sale, Section 4.16 Payroll Generation, Section 4.17 Nozzle Calibration Logging. (5) Section 1 "What It Is Not" updated — removed expense tracking, payroll, ancillary products, shift planning, calibration, notifications from future list. (6) Section 8 Future Enhancements updated — implemented items moved to "Already Implemented" callout; remaining future items revised; new items added (OAuth/SSO, PDF/Excel export, mobile app). |