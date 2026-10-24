VOLT X SOLAR VISION — FRONTEND DEMO
===================================

This version is for showing the frontend to hackathon judges before Java/MySQL are connected.

FILES
-----
index.html  - Page structure and navigation
style.css   - Visual design and responsive layout
app.js      - Demo calculations, charts, diagnostics, readings table, CSV export

RUN USING XAMPP
---------------
1. Extract this folder.
2. Copy the three files (index.html, style.css, app.js) into:
   C:\xampp\htdocs\voltx\
3. Open XAMPP Control Panel and click Start next to Apache.
   MySQL is not needed for this frontend-only demo.
4. Open:
   http://localhost/voltx/
5. Try navigation, add a reading, enter expected/actual kWh, select equipment observations,
   run diagnostics, review readings and download a CSV report.

RUN THE FULL APP WITH XAMPP AND VS CODE
---------------------------------------
1. Start MySQL in the XAMPP Control Panel. Apache is optional; the Java backend serves the page.
2. Import backend\db\schema.sql in phpMyAdmin to create the voltx database.
3. Open this project folder in VS Code and run the "VoltX: Run with XAMPP" task.
   The task creates backend\.env from its example and uses the Maven bundled in Tools.
   If your MySQL root account has a password, set MYSQL_PASSWORD in backend\.env.
4. Open http://localhost:8080/

DEMO DATA / LIMITATIONS
-----------------------
- The starting 20 kWh expected / 14 kWh actual reading is demonstration data.
- Readings are stored in this browser's localStorage. They are NOT saved to MySQL yet.
- The role switch is visual only and is NOT secure authentication.
- There is no real admin/user login in this frontend-only version.
- The charts use illustrative time-of-day splits, not actual interval measurements.
- Diagnostics use simple rules and user-entered observations. They do not prove a physical cause.
- No weather service is used for the diagnostic decision.
- The Google Fonts import requires internet; the page still works if it is unavailable.

NEXT INTEGRATION STEP
---------------------
When the Java backend and MySQL are ready, replace browser-only demo storage and role switching
with authenticated Java API calls and server-side authorization. Never rely on frontend-only
checks to protect real admin data.
