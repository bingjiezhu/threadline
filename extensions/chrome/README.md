# Threadline Capture extension

1. Start your Threadline app. For a hosted app, use a trusted HTTPS origin.
2. Open `chrome://extensions`, enable Developer mode and choose **Load unpacked**.
3. Select this `extensions/chrome` folder. Open its Options and confirm your workspace address.
4. Select up to 10,000 characters on a web page, right-click and choose **Save in Threadline**.
5. Review the captured wording, choose a person and optionally add a reminder. Click **Save conversation**.

This is a user-triggered selection handoff, not a crawler, universal importer or WeChat connector. It does not connect to native desktop apps. A copied WeChat message can instead be pasted into the app's Capture page. Nothing is sent to the workspace backend until the user saves the form.

The address stores only the origin; source page query parameters and fragments are discarded. Selected text enters the app in a URL fragment and is scrubbed after reading; this is not an end-to-end privacy guarantee against browser tooling, history or other installed extensions. Never use an untrusted workspace origin.

The release tests cover URL construction, limits, permissions and the app capture workflow. Installing and exercising the extension in an unrestricted real Chrome profile is a release/deployment check, not a completed test in the managed browser environment used for this build.
