# Webazi brand assets

| File | Use |
|------|-----|
| `icon.svg` | App icon, favicon source |
| `logo.svg` | Wordmark for light backgrounds |
| `logo-white.svg` | Wordmark for dark backgrounds |
| `og-image.svg` | Open Graph / social share (1200×630) |

**Colors**
- Brand green: `#00A86B`
- Dark: `#0B1F17`
- Accent: `#2DD4A0`
- Light surface: `#E8F5EE`

PNG exports (icon sizes, wordmark, og-image.png):

```bash
pip install Pillow
python scripts/generate-brand-pngs.py
```

That writes PNGs into `assets/brand/` and `assets/images/` (app icon, splash, favicon, adaptive icons, OG).
