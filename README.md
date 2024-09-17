# Etna-GEE-Analysis
Script investigates the relationship between SO₂ concentration over Mount Etna, Italy and other environmental indices through the application of Goggle Earth Engine (GEE). 

Data Collection:
Gets the country boundaries in USDOS/LSIB_SIMPLE/2017 dataset.
Creates geometry for the area of interest (Mt. Etna).
Specifies the period that should be covered for the analysis.

Preprocessing:
Corrects the scale of Sentinel - 2 images.
Analyses clouds, shadows, and water in the images captured by Sentinel – 2.
Completes the scaling of MODIS Land Surface Temperature (LST), as well as its aerosol optical depth (AOD) data.

Image Collections:
Collects, cuts and prepares Sentinel-2, TROPOMI SO₂, MODIS LST and MODIS AOD image collections with respect to their geometry and time period.

Index Calculation:
Derives NDVI, EVI and NBR from the Sentinel 2 images.
Prepares time series plots of NDVI, EVI, NBR, SO₂, LST and AOD.

Correlation Analysis:
Binds TROPOMI SO₂ with Sentinel 2. NDVI.
Generates time series plot of SO₂ and NDVI.

Elevation Analysis:

Analyzes the correlation between NDVI and elevation using SRTM DEM data.
Creates a chart showing the relationship between NDVI and elevation.
NDVI Comparison:

Compares NDVI values from Sentinel-2 and MODIS.
Creates a time series chart for the difference between Sentinel-2 NDVI and MODIS NDVI.
Seasonal Decomposition:

Decomposes NDVI into annual and monthly means.
Creates charts for annual and monthly mean NDVI.
EVI2 and SO₂ Correlation:

Calculates EVI2 from Sentinel-2 images.
Joins EVI2 data with TROPOMI SO₂ data.
Creates a time series chart for the correlation between EVI2 and SO₂.
Prints the p-value for the correlation between EVI2 and SO₂.
Usage
To use this script, follow these steps:

Open Google Earth Engine Code Editor.
Copy and paste the script into the editor.
Run the script to visualize the results and print the correlation values and charts.
Dependencies
Google Earth Engine account and access to the Code Editor.
Notes
Ensure that the region of interest and date range are correctly defined for your specific analysis.
The script uses various datasets from Google Earth Engine, including Sentinel-2, TROPOMI, MODIS, and SRTM DEM.
