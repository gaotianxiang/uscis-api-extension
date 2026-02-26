# USCIS Case API Viewer

[![CI](https://github.com/gaotianxiang/uscis-api-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/gaotianxiang/uscis-api-extension/actions/workflows/ci.yml)

A Chrome extension that automatically finds your USCIS case receipt numbers and fetches their API responses in a beautified view.

## How It Works

1. Sign into [my.uscis.gov](https://my.uscis.gov)
2. Navigate to your [applicant page](https://my.uscis.gov/account/applicant)
3. The extension detects all case receipt numbers on the page
4. For each receipt number, it fetches the JSON response from the USCIS case API
5. Click the extension icon to view beautified, syntax-highlighted JSON for each case

## Features

- Automatic receipt number detection (IOE, EAC, WAC, LIN, SRC, NBC, MSC, YSC, MCT prefixes)
- SPA-aware — handles dynamically rendered content
- Collapsible JSON tree view with syntax highlighting
- Raw JSON view toggle
- Copy JSON to clipboard
- Badge showing number of cases found
- Refresh button to re-fetch data

## Installation

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Sign into my.uscis.gov and navigate to your applicant page

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Chrome extension manifest (Manifest V3) |
| `content.js` | Content script that extracts receipt numbers from the page |
| `background.js` | Service worker that fetches the case API with session cookies |
| `popup.html` | Popup UI shell |
| `popup.js` | JSON tree renderer and popup logic |
| `styles.css` | Popup styling with JSON syntax highlighting |

## API Endpoint

The extension fetches from:
```
GET https://my.uscis.gov/account/case-service/api/cases/{RECEIPT_NUMBER}
```

This uses the browser's existing session cookies — no separate authentication required.
