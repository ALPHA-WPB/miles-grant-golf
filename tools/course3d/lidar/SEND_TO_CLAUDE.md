# Miles Grant Country Club: handoff for my 3D golf app

Please integrate the supplied real-world terrain for the entire Miles Grant Country Club golf course in Stuart / Port Salerno, Florida into my existing golf app. Inspect my app's source and framework before choosing a loader. If you cannot access my app code, ask me for it and prepare the import assets separately; do not claim integration is complete.

## What I am supplying

Start with this document and `Miles_Grant_Terrain_GeoTIFF_Under30MB.zip`. Alternatively, use `Miles_Grant_Terrain_HeightGrid_Under30MB.zip` for a simpler binary array loader. These are independent alternatives, not pieces of a multipart archive. Unzip the selected package before reading its data. Both describe the same measured terrain, so do not overlay them as separate surfaces.

The original complete archive is approximately 1.31 GB. It can remain on my computer. Do not require the large LiDAR collection just to render ground terrain. If you have local project access, the prepared data are at:
`/Users/wpbit/Documents/Codex/2026-11-06/download-the-highest-resolution-available-lidar/outputs/Miles_Grant/`
A path written in this document does not grant cloud Claude access to my computer. If you cannot open it, use my uploaded smaller package or ask me to put it in your accessible project folder.

## What the “images” actually are

| File | Meaning | What to do with it |
|---|---|---|
| `terrain_utm17_meters.tif` | A GeoTIFF digital elevation model: each pixel is ground elevation in meters, with map coordinates. It is not a photograph, satellite image, or ready-made 3D model. | Read numeric pixels and georeferencing with a GeoTIFF/GIS library; build the terrain mesh and query heights for object placement. Do not import it as a golf-course color texture. |
| `terrain_native_2p5ft.tif` and `elevation/source/*.tif` in the complete package | Same source terrain in original Florida State Plane coordinates; both horizontal coordinates and elevations are US survey feet. | Keep as source/reference. Prefer the prepared meter-based file for app integration. |
| `heightmap.float32` with `heightmap.json` | The meter-based GeoTIFF expressed as a raw numeric height array plus a small description of its layout. | Use as an alternative to installing a GeoTIFF reader. Read the JSON first; the binary has no embedded header. |
| `course_boundary.geojson` | An OpenStreetMap course outline and a larger rectangular download area, in longitude/latitude. | Use for geographic alignment and optional clipping. It is not an official surveyed property boundary or a map of individual holes. |
| `.laz` / `.copc.laz` in the complete package | Compressed 3D laser measurements, with point classifications. They can contain ground, buildings, vegetation, and other returns. | Optional advanced processing. Read using LASzip-capable software; class 2 is ground. Stream/process these outside the browser. Do not treat them as ordinary image attachments. |
| `terrain_preview.png` | A shaded elevation illustration generated from the DEM, with the mapped course outline highlighted. | Orientation/visual reference only. Its colors are artificial and it is not aerial imagery. Never infer fairway, green, or bunker boundaries from its colors. |
| `coverage_report.json` | Coverage and integrity checks plus point counts. | Read before importing; use as evidence for coverage, not as elevation data. |

There are no aerial photos, turf color textures, surveyed green outlines, or hole layouts in this dataset. Build those from separately supplied references rather than inventing them.

## Survey, quality, and coverage

Recommended source: USGS/FDEM Martin County QL1, acquired December 24, 2018 through April 25, 2019. The finest native bare-earth raster found in the checked USGS/NOAA holdings has 2.5 US survey foot cells, approximately 0.762 meters. The prepared meter raster retains approximately this spacing after bilinear horizontal reprojection. Grid spacing is not a guarantee of elevation accuracy.

The download rectangle is longitude -80.187 to -80.169, latitude 27.141 to 27.156. It includes the mapped golf course plus a generous surrounding margin. All mapped course DEM cells and all buffered rectangle DEM cells have valid data. The mapped outline is about 83 acres; the club reports 88 acres, which is one reason to retain the buffer. It is not a surveyed course boundary.

The complete package also includes older NOAA June 2018 coastal COPC LAZ tiles and January 2016 4-foot DEM tiles, plus the USGS standard 1-meter DEM. Do not combine all these rasters as independent terrain layers. Use the recommended newer terrain first. Reconcile dates, CRS, units, and GEOID12B versus GEOID18 vertical processing before comparing or merging point clouds.

## Exact terrain import instructions

1. `terrain_utm17_meters.tif` uses horizontal NAD83 / UTM zone 17N, EPSG:26917. Its elevations are absolute meters NAVD88, based on source GEOID12B. Its no-data value is -9999. Do not interpret coordinates as latitude/longitude, apply another feet-to-meters conversion, or convert NAVD88 to ellipsoid heights without an explicit transformation.
2. The height grid is little-endian Float32, 2356 columns by 2197 rows. Expected binary length: 20,704,528 bytes. Row zero is north; columns run west to east. `heightmap.json` is authoritative for dimensions and affine transform. The JSON contains metadata, not the height samples.
3. For column c and row r, pixel center easting = 580551.9317352133 + (c + 0.5) × 0.762001524. Pixel center northing = 3003986.3994042953 - (r + 0.5) × 0.762001524. Height is the corresponding Float32 sample in meters.
4. Use a local Y-up scene: X = easting - 580551.9317352133; Y = elevation; Z = 3003986.3994042953 - northing. Keep this origin and the CRS in export metadata so positions remain reversible. If the existing app uses another axis convention, adapt explicitly and test north direction.
5. Build terrain from valid adjacent samples. Avoid a full-resolution mesh of roughly ten million triangles in an ordinary browser: begin with a reduced render mesh, then use chunks or levels of detail. Retain the full height grid for accurate elevation queries. Any reduced render mesh is a performance derivative; it does not replace the source data.
6. Skip no-data vertices/faces. Do not rescale height independently per chunk. Use a common origin, units, and height baseline throughout the course. Apply a consistent vertical offset only if the app requires it, and document it.
7. Convert the boundary GeoJSON from longitude/latitude to the scene CRS before overlaying it. Do not draw it using longitude/latitude numbers as scene meters.
8. Place tees, pins, trees, and other objects by querying the terrain elevation at their mapped XY positions. No authoritative positions for those objects were supplied here. Do not invent them or claim current green detail from this older survey.
9. Do not infer lake-bed elevations from a bare-earth DEM; water may be hydro-flattened. This survey cannot guarantee current course renovations or centimeter-scale putting slopes.
10. Before delivery, verify the height array length, north direction, geographic alignment, correct units, plausible terrain scale, and seamless chunk boundaries. Report exactly what was integrated and any missing app-specific inputs. Preserve USGS/NOAA provenance and OpenStreetMap attribution.

## If the upload is rejected

Do not assume a ZIP or TIFF is supported because it fits the size limit. If you have code execution/file tools, try extracting the archive and reading its numerical files with code. If you only have ordinary text/image chat, use this document to write the app loader and ask me to put the unzipped terrain files into the app's local assets directory. A PNG preview alone cannot reproduce the measured terrain.

For local development, the preferred workflow is to unzip the terrain package into the existing app project and use Claude Code or another Claude setup with explicit access to that folder. For web chat, upload this document (or paste its text) and the small terrain package if your attachment interface accepts it. If Markdown attachments are rejected, use the identical `.txt` handoff or paste the text.

## Upload limits checked November 6, 2026

Anthropic's “Upload files to Claude” page lists 500 MB per chat attachment and 30 MB per Project file, while its “Create and edit files with Claude” page lists 30 MB for that workflow. The regular supported image list does not include GeoTIFF and the document list does not include LAZ or ZIP. Therefore these terrain archives are deliberately below 30 MB, but processing support still depends on the tools enabled in your Claude session. Do not try to put the full point cloud into model context. Breaking the full archive into dozens of chunks adds reassembly work and does not solve unsupported formats or browser performance.

Sources:
- https://support.claude.com/en/articles/8241126-upload-files-to-claude
- https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude
