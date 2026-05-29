# ZeroDown Real-time Machine Analytics Dashboard

A premium, responsive Industrial IoT (IIoT) dashboard designed with glassmorphism aesthetics. It pulls live sensor metrics from Google Sheets in real-time (auto-refreshes every 5 seconds) and provides an interactive controller to simulate sensor reports, writing them back to the spreadsheet through Google Apps Script.

## 🛠️ Project Structure
- `index.html` - The application's structural skeleton, containing KPI monitors, charts, logs grid, simulator, and documentation.
- `style.css` - Custom styling built with HSL color tokens, dark theme backdrop-filters, custom typography, animations, and layouts.
- `app.js` - Client-side engine connecting the public Google Sheets API, rendering real-time line charts, exporting logs, and posting simulator reports.

---

## ⚡ Quick Start (Local Setup)

1. Open `index.html` in your browser.
2. The dashboard will automatically link to the Google Sheet ID `1CjVO9-OXdzSpfIY4bK_2uf7AjS9tOkF-ixws69SXObc` and start polling.
3. Use the **IoT Telemetry Simulator** panel to simulate sensor records.

---

## ⚙️ Google Apps Script Configuration

If you need to configure or update the Google Apps Script Web App:

1. Open your target Google Sheet.
2. Click **Extensions > Apps Script**.
3. Replace any existing code with the following snippet:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var params = JSON.parse(e.postData.contents);
  
  var timestamp = new Date();
  var status = params.status || "normal";
  var score = parseFloat(params.score) || 0;
  var power = params.power || "ON";
  var vibration = parseFloat(params.vibration) || 0;
  
  // Appends a new data row matching columns: Timestamp, Status, Score, Power State, Vibration
  sheet.appendRow([
    timestamp,
    status,
    score,
    power,
    vibration
  ]);
  
  return ContentService.createTextOutput(JSON.stringify({
    "result": "success",
    "row": sheet.getLastRow()
  })).setMimeType(ContentService.MimeType.JSON)
     .setHeader("Access-Control-Allow-Origin", "*");
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    "status": "online",
    "message": "Apps Script API is functional"
  })).setMimeType(ContentService.MimeType.JSON)
     .setHeader("Access-Control-Allow-Origin", "*");
}
```

4. Click the **Save** icon (disk).
5. Click **Deploy > New deployment**.
6. Select **Web app** as the deployment type:
   - *Execute as*: Me (your email)
   - *Who has access*: Anyone (this is important so the web app can receive simulator requests)
7. Click **Deploy** and copy the **Web app URL**.
8. If your Web App URL is different from the provided one, replace the `SCRIPT_URL` variable at the top of your `app.js` file with your new URL:
   ```javascript
   const SCRIPT_URL = 'YOUR_NEW_APPS_SCRIPT_URL';
   ```
