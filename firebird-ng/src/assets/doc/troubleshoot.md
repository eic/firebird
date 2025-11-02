# Troubleshoot problems

## First Steps


1. **>>RELOAD THE PAGE<<** - Press `F5` (or `Ctrl+R` / `Cmd+R`) to
   refresh the browser window. Firebird is a browser application, and
   the first line of help is to RELOAD THE PAGE. Some config changes
   are taken in effect **only after manual page reload**!


2. **Check configuration** - Firebird stores its configuration
   parameters in browser local storage. It might be that some parameters 
   got out of sync, renamed or changed (especially after some time not using). 
   Go through configs and press "Display" button. To reset/remove
   all parameters from your browser see P4.


3. **Check the browser console** - Press `F12` (or `Ctrl+Shift+I` /
   `Cmd+Option+I`) and check the Console tab for errors and log
   messages. Firebird frontend keeps it as a primary logging place.
   We try to keep errors easy to understand.

   > The next errors in console ARE OK and don't indicate problems:
   > - io.mjs:2987 Refused to get unsafe header "Content-Range"
   > - Warnings usually are OK, especially: 
   >    - WARNING: Multiple instances of Three.js being imported.
   >    - \[Violation\] *Something* took XXms

4. **Clear browser local storage** - Open browser DevTools (`F12`), go
   to Application tab → Local Storage → select the site URL → click
   "Clear All" button, then reload the page. This clears all saved
   configuration and resets Firebird to default settings.



