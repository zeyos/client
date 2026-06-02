# Business App Benchmarks For ZeyOS Agents

This file summarizes how established business platforms model activities, timelines, collaboration spaces, and collections workflows. Use it to set better default assumptions for ZeyOS agents.

## Source Set

- [Salesforce Trailhead: Collaborate with Everyone](https://trailhead.salesforce.com/content/learn/modules/chatter_basics/chatter_basics_collaborate)
- [Salesforce Help: Access Salesforce Records in Slack Channels](https://help.salesforce.com/s/articleView?id=slack.salesforce_record_access_slack.htm&type=5)
- [Odoo Documentation: Activities](https://www.odoo.com/documentation/19.0/applications/essentials/activities.html)
- [Odoo Documentation: Channels](https://www.odoo.com/documentation/19.0/applications/productivity/discuss/team_communication.html)
- [Odoo Documentation: Follow-up on Invoices](https://www.odoo.com/documentation/19.0/applications/finance/accounting/payments/follow_up.html)
- [SAP Help: Dunning](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/99fb46a79ab241d5984df80fe7a9aa32/4df4cd53d7667514e10000000a174cb4.html)
- [SAP Help: SAP Collections Management](https://help.sap.com/docs/SAP_ERP/d7d4594de25b40e895b13d63b17437bb/7401d553088f4308e10000000a174cb4.html)
- [SAP Help: Analysis of Receivables in Connection with SAP Collections Management](https://help.sap.com/doc/saphelp_scm700_ehp02/7.0.2/en-US/c5/63652eb3b34e97ba6f9fefcebf5d36/content.htm)
- [Workday: Business Process Framework Datasheet](https://forms.workday.com/en-us/reports/business-process-framework-datasheet/form.html)
- [Workday Everywhere for Slack and Microsoft Teams](https://www.workday.com/en-us/products/workday-everywhere.html)
- [Microsoft Dynamics 365: Timeline Wall and Activities](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/basics/activities-activity-feeds?view=op-9-1)

## Stable Cross-Platform Patterns

### 1. Activities Are Smaller Than Tasks Or Projects

- Salesforce lets users turn collaboration posts into tasks.
- Odoo has scheduled activities directly on records.
- Dynamics treats activities as record-level work and reminders.
- Workday routes work as inbox tasks inside business processes.

Implication for ZeyOS:

- Treat `actionsteps` as record-bound activities or follow-ups.
- Prefer `tasks` for broader delivery work.
- Prefer `projects` for governed multi-record initiatives.

### 2. Mature Systems Keep A Record Timeline

- Salesforce record pages surface feed tracking, posts, comments, and tasks.
- Odoo chatter keeps notes, messages, followers, and activities on the record.
- Dynamics uses a timeline to combine notes, posts, and activities.
- Workday is less social, but still centers process history and in-context tasks around the record or process step.

Implication for ZeyOS:

- Treat `records`, `comments`, `files`, and `events` as a likely user-facing timeline layer.
- When the user asks for "what happened recently?", start there before over-querying operational tables.

### 3. Collaboration Spaces And Record Feeds Are Separate

- Salesforce distinguishes record feeds from Slack channels and groups.
- Odoo distinguishes chatter on a business record from Discuss channels.
- Dynamics distinguishes the record timeline from broader collaboration tooling.

Implication for ZeyOS:

- Treat `channels` as shared collaboration spaces.
- Treat `entities2channels` as the bridge between a business record and a collaboration room.
- Do not collapse channels into tags or categories unless instance evidence supports that.

### 4. Followers Mean Attention, Not Ownership

- Salesforce users follow records to receive updates.
- Odoo followers receive record updates in chatter.
- Dynamics and adjacent CRMs use subscriptions or following similarly.

Implication for ZeyOS:

- Treat `follows` as watcher or notification intent.
- Do not confuse a follower with the assignee, owner, or permission holder.

### 5. Collections Is Stage-Based And Worklist-Driven

- SAP models dunning with procedures, levels, and specialist worklists.
- SAP Collections Management prioritizes overdue receivables and assigns them to collectors.
- Odoo follow-up runs can send letters, emails, SMS, or create activities depending on the configured level.

Implication for ZeyOS:

- Separate:
  - receivable exposure in `transactions`
  - cash received in `payments`
  - collection stage in `dunning`
  - collector next step in `actionsteps` or other operational work
- Collection answers should report both balance state and follow-up stage.

### 6. Process Systems Favor Explicit Responsibility

- Workday business processes push named approval, review, and action tasks to users.
- SAP collections assigns worklist items to collection specialists or groups.
- Odoo activities always carry an assigned user and deadline.

Implication for ZeyOS:

- Favor `assigneduser`, `duedate`, and status when choosing which entity best represents a next action.
- If the user asks "who should act next?", prefer the entity with explicit assignee and due date over looser discussion artifacts.

## Recommended Default Interpretations For ZeyOS

- `actionsteps`: scheduled activities or follow-ups
- `tasks`: broader execution work
- `tickets`: service or issue work
- `records` + `comments` + `files` + `events`: timeline/feed layer
- `channels`: collaboration rooms or shared streams
- `follows`: subscriptions/watchers
- `dunning`: collection-stage object

## Enhancements This Benchmark Supports

- Add a dedicated collaboration and activity skill for `records`, `comments`, `files`, `channels`, and `follows`.
- Route "what happened on X?" questions through a timeline workflow instead of only querying tickets and tasks.
- Prefer `actionsteps` for promised next actions on accounts, invoices, and tickets.
- Strengthen collections answers with stage, assignee, and next-step language.
- Treat record feed questions and channel questions as related but distinct workflows.
