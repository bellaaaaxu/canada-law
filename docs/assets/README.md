# Assets

`social-preview.png` (1280×640) is the card shown when the repository link is shared. It is rendered from `social-preview.html` with a headless browser, for example on Windows:

```bash
msedge --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,640 --screenshot=social-preview.png social-preview.html
```

Upload it in the repository settings: Settings → General → Social preview → Edit → Upload an image.
