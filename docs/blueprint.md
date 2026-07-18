# CryptoBox Scheduler — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that automatically posts scheduled mixed crypto updates (price snapshots, signals, and news) to a Binance Crypto Box channel. It fetches data, formats messages, and posts autonomously with admin controls for scheduling and manual posts.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Binance Crypto Box channel owner
- Telegram channel subscribers interested in crypto market updates

## Success criteria

- Bot successfully posts scheduled updates to the channel every 15 minutes
- Admin commands work as expected for owner in private chat
- Error notifications are sent to owner when posting fails

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the admin setup menu for the channel owner
- **/status** (command, actor: user, command: /status) — Show current settings and next scheduled post
- **/pause** (command, actor: user, command: /pause) — Pause scheduled posts
- **/resume** (command, actor: user, command: /resume) — Resume scheduled posts
- **/postnow** (command, actor: user, command: /postnow) — Trigger an immediate post
- **/setfreq** (command, actor: user, command: /setfreq) — Change post frequency (allowed values: 5,15,30,60,240,1440 minutes)
- **/setassets** (command, actor: user, command: /setassets) — Adjust tracked crypto assets (comma-separated symbols)

## Flows

### Setup flow
_Trigger:_ /start

1. Owner provides channel username/invite
2. Bot verifies posting permissions
3. Owner confirms default settings
4. Bot saves settings and confirms success

_Data touched:_ Admin settings

### Scheduled posting
_Trigger:_ cron schedule

1. Fetch prices for tracked assets
2. Compute trading signals
3. Fetch 1-2 crypto news items
4. Format message with timestamp, prices, signals, and news
5. Post message to channel
6. Log post details

_Data touched:_ Post, Schedule, Asset list

### Admin command handling
_Trigger:_ command in private chat

1. Parse command and parameters
2. Update settings or trigger action
3. Send confirmation response

_Data touched:_ Admin settings, Schedule

### Error handling
_Trigger:_ posting failure

1. Detect posting failure
2. Send error notification to owner
3. Attempt retry with exponential backoff

_Data touched:_ Admin settings, Schedule

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Admin settings** _(retention: persistent)_ — Configuration for the bot's operation
  - fields: channel_id, enabled, timezone, post_frequency, tracked_assets, news_sources
- **Post** _(retention: persistent)_ — A single channel message with market data
  - fields: timestamp, prices, signals, news_headlines
- **Schedule** _(retention: persistent)_ — Posting cadence and state
  - fields: last_post_time, next_post_time, is_paused
- **Log** _(retention: persistent)_ — Minimal logs of recent posts for diagnostics
  - fields: timestamp, post_summary

## Integrations

- **Telegram** (required) — Bot API messaging and channel posting
- **Market Data API** (required) — Fetch live cryptocurrency prices
- **Signal Generator** (required) — Compute simple trading signals
- **News Aggregator** (required) — Fetch crypto news headlines
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Set channel ID
- Adjust post frequency
- Change tracked assets
- Pause/resume posts
- Trigger manual posts

## Notifications

- Error notifications to owner's private chat
- Confirmation of manual posts
- Status updates for schedule changes

## Permissions & privacy

- Bot must be added as channel admin to post
- Admin commands only accessible to verified owner
- No personal data collected from channel subscribers

## Edge cases

- Channel posting permissions revoked
- API rate limits exceeded
- Invalid asset symbols provided
- News source unavailable
- Owner sends unrecognized commands

## Required tests

- Verify scheduled posts appear in channel at correct intervals
- Test admin commands work in private chat
- Validate error notifications are sent when posting fails
- Confirm message formatting matches requirements

## Assumptions

- Owner will add bot as channel admin before deployment
- Default APIs will provide sufficient data for free tier
- Owner will handle any future API key requirements if needed
- Owner will provide valid channel credentials during setup
