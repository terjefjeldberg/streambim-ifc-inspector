# StreamBIM IFC Inspector

A project-independent StreamBIM widget for exploring IFC file information and the hierarchy of objects selected in the 3D viewer. The interface is in Norwegian, with familiar IFC Header and BIM Data categories inspired by Solibri's Info View.

## Features

- Automatically connects to the StreamBIM project when opened as a widget. No project URL is required inside StreamBIM.
- Browse model layers, nested layers and individual model files.
- Read IFC file name, export timestamp, author, organization, exporting application, description and schema.
- Inspect project identification, authoring application and site information in grouped property tables.
- Click an object in StreamBIM to highlight it in orange and read its properties. Shift-click preserves multiple selections.
- See the original IFC hierarchy under **BIM Data → Location**, including project, site, building, storey and component where those relationships exist.
- Read `.ifc` files locally without uploading them to a server.

All project IDs, model IDs, layers and files come from StreamBIM at runtime. No project models or credentials are included in this repository.

## Install as a StreamBIM widget

1. Download or clone this repository.
2. Publish the contents of **`dist/`** on an HTTPS static host. No build step is required. Keep the directory structure, including `vendor/`, and serve `.mjs` files as JavaScript.
3. Register and enable the widget URL in StreamBIM. StreamBIM requires custom widgets to be approved; see the [official integration documentation](https://github.com/streambim/streambim-widget-api#integration).
4. Add the entry below to your existing widget configuration, replacing `YOUR-WIDGET-HOST` with your own host. Preserve any existing widgets and sources.

```json
{
  "id": "ifc-inspector",
  "rootUrl": "https://YOUR-WIDGET-HOST/",
  "messageKey": "IfcInnsiktEmbedded",
  "name": "IFC-innsikt"
}
```

The host must allow iframe embedding from StreamBIM. Once installed, open the widget, expand a model layer and select an IFC file, or click an object in 3D. Users need access to the original documents in the StreamBIM project.

### Hosted widget on GitHub Pages

The widget is hosted at **https://terjefjeldberg.github.io/streambim-ifc-inspector/**. Use that address as `rootUrl` in StreamBIM. GitHub Pages must publish the `main` branch from `/ (root)`. The root `index.html` loads assets from `dist/` with a base URL, preserving the direct StreamBIM parent connection without an extra iframe or redirect. `.nojekyll` serves the widget as static files.

For a fork, enable GitHub Pages on your own repository and use its Pages URL. For another static host, publish the contents of `dist/` directly.

## Run locally

Requires Node.js 22 or newer. No dependency installation is needed.

```sh
git clone https://github.com/terjefjeldberg/streambim-ifc-inspector.git
cd streambim-ifc-inspector
npm start
```

Open [http://127.0.0.1:4186](http://127.0.0.1:4186). Outside StreamBIM, you can supply a project URL to test against a separate StreamBIM window, or open a local IFC file. The project URL form is hidden when running inside StreamBIM.

```sh
npm test
```

The tests cover IFC parsing and relationships, Unicode, duplicate GlobalIds, dynamic project and file discovery, pagination, the actual Penpal 6 panel handshake, selection replacement, Shift-click, rapid clicks and viewer failures. Live model discovery, file reading, hierarchy and orange selection changes have also been checked against a StreamBIM project.

## Data and access

The widget uses the signed-in StreamBIM user's access through the official widget API. It does not request or store passwords or API keys. Original files are processed in a browser worker and retained only in memory. There is no application backend, telemetry or external analysis service. Cross-origin signed download URLs must permit access from the widget's origin.

## Limitations

- Supports STEP-serialized **`.ifc`** files. IFCZIP and IFCXML need extraction or conversion first. Other source formats can appear in the layer tree but are not parsed as IFC.
- Reads the original document currently available for download. This can differ from the revision published in 3D; the interface identifies this limitation.
- The browser reader limits each file to 200 MB and retains up to three parsed files. Large models may use substantial memory.
- This is a metadata and relationship reader, not a geometry viewer or IFC validator. Some IFC variants may need additional support.
- Pset_ and Qto_ groups are categorized by name. This does not validate conformance with buildingSMART property-set definitions. Solibri-specific calculated values are not reproduced.
- If the host cannot report the active building/model and the project has multiple models, a model selector is shown.
- The StreamBIM adapter uses REST read routes observed in the current application. API changes may require updates.

## Structure

| Path | Purpose |
| --- | --- |
| `dist/` | Ready-to-host widget and local vendor libraries |
| `dist/streambim.mjs` | StreamBIM data access and selection |
| `dist/embedded-connection.mjs` | Panel protocol compatibility |
| `dist/ifc.mjs` | IFC STEP metadata and hierarchy reader |
| `dist/ifc-worker.mjs` | Parsing worker and in-memory cache |
| `dist/info-view.mjs` | Curated field groups |
| `tests/` | Automated tests using synthetic data |
| `serve.mjs` | Local preview server |

## Compatibility notes

StreamBIM panel connections currently use Penpal 6; the official modern widget SDK is available as a fallback and for standalone project windows. Both are vendored locally. In the tested StreamBIM application, `deHighlightAllObjects` clears the selection but does not resolve its returned promise. The adapter therefore uses a following `getViewportState` request to confirm completion before calling `highlightObject`. It does not wait indefinitely for the missing reply.

## License and acknowledgements

This widget is available under the [MIT License](LICENSE).

- [StreamBIM widget API](https://github.com/streambim/streambim-widget-api), MIT. License: `dist/vendor/STREAMBIM-LICENSE`.
- [Penpal 6.2.2](https://github.com/Aaronius/penpal), MIT. License: `dist/vendor/PENPAL-LICENSE`.
- [Solibri Info View](https://help.solibri.com/hc/en-us/articles/21701046739607-The-Info-View) informed the information grouping. This is an independent widget, not an official Solibri or StreamBIM product.
- [Public StreamBIM integration examples](https://github.com/byggstyrning/n8n-nodes-streambim) informed REST route discovery; the adapter was then checked against the live widget API.

The StreamBIM SDK bundle was retrieved on 2026-11-26. SHA-256: `033cb5bae6e7cc7496e19ea0e7e073cfa4c2986694a45eca989d7a4518fdf308`.

