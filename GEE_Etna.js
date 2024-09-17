var dataset = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var Etna = dataset.filter(ee.Filter.eq('country_na', 'Italy'));


var geometry = ee.Geometry.Polygon([
 [14.908316213031743,
37.72717383315791] ,

[15.027792531391118,37.72717383315791],

[15.027792531391118,37.795571663203624],

[14.908316213031743,37.795571663203624],

[14.908316213031743,37.72717383315791]
]);

var startDate = '2018-01-01';
var endDate = '2019-12-31';


function applyScaleFactors(image) {
  var opticalBands = image.select(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12']).multiply(0.0001);
  return image.addBands(opticalBands, null, true);
}


function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  
 
  var shadowBitMask = 1 << 3;
  var cloudShadowMask = qa.bitwiseAnd(shadowBitMask).eq(0);
  
 
  var waterBitMask = 1 << 2;
  var waterMask = qa.bitwiseAnd(waterBitMask).eq(0);
  
 
  var finalMask = mask.and(cloudShadowMask).and(waterMask);
  

  return image.updateMask(finalMask)
              .setDefaultProjection('EPSG:4326', null, 10)
              .reproject('EPSG:4326', null, 10);
}


function scaleMODISLST(image) {
  var lstDay = image.select('LST_Day_1km').multiply(0.02).subtract(273.15);
  var qcDay = image.select('QC_Day');
  var lstMask = qcDay.bitwiseAnd(1).eq(0)
                 .and(qcDay.bitwiseAnd(2).eq(0))
                 .and(lstDay.gt(-50).and(lstDay.lt(50)));
  return image.addBands(lstDay.updateMask(lstMask).rename('LST_Day_C'), null, true);
}


function scaleMODISAOD(image) {
  var aod = image.select('Optical_Depth_047').multiply(0.001);
  var qc = image.select('AOD_QA');
  var aodMask = qc.bitwiseAnd(3).eq(0)
                 .and(aod.gte(0).and(aod.lte(5)));
  return image.addBands(aod.updateMask(aodMask).rename('AOD_scaled'), null, true);
}


var sentinel2 = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterDate(startDate, endDate)
  .filterBounds(geometry)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 5))
  .map(applyScaleFactors)
  .map(maskS2clouds);

var tropomi = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_SO2')
  .filterDate(startDate, endDate)
  .filterBounds(geometry)
  .select('SO2_column_number_density');

var modisLST = ee.ImageCollection('MODIS/006/MOD11A1')
  .filterDate(startDate, endDate)
  .filterBounds(geometry)
  .map(scaleMODISLST);

var modisAOD = ee.ImageCollection('MODIS/006/MCD19A2_GRANULES')
  .filterDate(startDate, endDate)
  .filterBounds(geometry)
  .map(scaleMODISAOD);


var simplifiedGeometry = geometry.simplify(2000);
Map.centerObject(simplifiedGeometry, 12);


var band_viz_SO2 = {min: 0.0, max: 5.0, palette: ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red']};
var band_viz_LST = {min: 0, max: 1320, palette: ['blue', 'cyan', 'green', 'yellow', 'red']};


Map.addLayer(Etna, {}, 'Etna');


var calculateIndices = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  var evi = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
    }).rename('EVI');
  var nbr = image.normalizedDifference(['B8', 'B12']).rename('NBR');
  return image.addBands([ndvi, evi, nbr]);
};

var indexCollection = sentinel2.map(calculateIndices);


var createTimeSeries = function(collection, bandName, title) {
  return ui.Chart.image.series({
    imageCollection: collection.select(bandName),
    region: geometry,
    reducer: ee.Reducer.mean(),
    scale: 1000
  }).setOptions({
    title: title,
    vAxis: {title: bandName},
    hAxis: {title: 'Date'}
  });
};

print(createTimeSeries(indexCollection, 'NDVI', 'NDVI Time Series'));
print(createTimeSeries(indexCollection, 'NBR', 'NBR Time Series'));
print(createTimeSeries(tropomi.select('SO2_column_number_density'), 'SO2_column_number_density', 'SO2 Time Series'));
print(createTimeSeries(modisLST.select('LST_Day_C'), 'LST_Day_C', 'Daytime Surface Temperature Time Series'));
print(createTimeSeries(modisAOD.select('AOD_scaled'), 'AOD_scaled', 'AOD Time Series'));


var joinedCollection = ee.Join.saveFirst('ndvi').apply({
  primary: tropomi,
  secondary: indexCollection.select('NDVI'),
  condition: ee.Filter.maxDifference({
    difference: 1 * 24 * 60 * 60 * 1000, // 1 gün
    leftField: 'system:time_start',
    rightField: 'system:time_start'
  })
});


var so2NdviCollection = ee.ImageCollection(joinedCollection.map(function(feature) {
  var so2Image = ee.Image(feature);
  var ndviImage = ee.Image(feature.get('ndvi'));
  return ee.Image.cat(so2Image, ndviImage)
    .rename(['SO2_column_number_density', 'NDVI'])
    .set('system:time_start', so2Image.get('system:time_start'));
})).filter(ee.Filter.notNull(['system:time_start']));


var so2NdviChart = ui.Chart.image.series({
  imageCollection: so2NdviCollection.select(['SO2_column_number_density', 'NDVI']),
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 1000
}).setOptions({
  title: 'SO2 ve NDVI Zaman Serisi',
  vAxes: {
    0: {title: 'SO2 (mol/m^2)', baseline: 0},
    1: {title: 'NDVI', baseline: 0}
  },
  hAxis: {title: 'Tarih'},
  series: {
    0: {targetAxisIndex: 0, color: 'red'},
    1: {targetAxisIndex: 1, color: 'green'}
  },
  chartArea: {left: '10%', right: '10%', top: '10%', bottom: '20%'}
});

print(so2NdviChart);


var correlation = so2NdviCollection.select(['SO2_column_number_density', 'NDVI']).reduce(ee.Reducer.pearsonsCorrelation());
var correlationValue = correlation.select('correlation').reduceRegion({
  reducer: ee.Reducer.first(),
  geometry: geometry,
  scale: 1000,
  maxPixels: 1e9
});

correlationValue.evaluate(function(result) {
  var correlation = result.correlation;
  print('SO2 ve NDVI Korelasyonu:', correlation);


  var sampleSize = so2NdviCollection.size().getInfo();


  var pValue = calculatePValue(correlation, sampleSize);
  print('p-değeri:', pValue);
});


var scatterChart = ui.Chart.image.byRegion({
  image: so2NdviCollection.select(['SO2_column_number_density', 'NDVI']).mean(),
  regions: geometry,
  reducer: ee.Reducer.mean(),
  scale: 1000
}).setOptions({
  title: 'SO2 ve NDVI Scatter Plot',
  hAxis: {title: 'SO2 (mol/m^2)'},
  vAxis: {title: 'NDVI'},
  pointSize: 3,
  trendlines: { 0: {color: 'red'} }
});

print(scatterChart);


function calculatePValue(correlation, sampleSize) {
  var t = correlation * Math.sqrt((sampleSize - 2) / (1 - correlation * correlation));
  var df = sampleSize - 2;
  
  
  var z = Math.abs(t);
  
  
  var p = Math.exp(-0.717 * z - 0.416 * z * z);
  
  return p;
}


var dem = ee.Image('USGS/SRTMGL1_003').clip(geometry);


var ndviElevation = indexCollection.select('NDVI').mean()
  .addBands(dem.rename('elevation'))
  .reproject({crs: 'EPSG:4326', scale: 100});  


var ndviElevationCorrelation = ndviElevation.reduceRegion({
  reducer: ee.Reducer.pearsonsCorrelation(),
  geometry: geometry,
  scale: 100,  
  maxPixels: 1e8  
});


ndviElevationCorrelation.evaluate(function(result) {
  if (result && result.correlation !== null) {
    var correlation = result.correlation;
    print('NDVI ve Yükseklik Korelasyonu:', correlation);
    
 
    var ndviElevationValues = ndviElevation.reduceRegion({
      reducer: ee.Reducer.toList(),
      geometry: geometry,
      scale: 100,  
      maxPixels: 1e8  
    });

    ndviElevationValues.evaluate(function(values) {
      if (values && values.NDVI && values.elevation) {
        var ndviValues = ee.List(values.NDVI);
        var elevationValues = ee.List(values.elevation);

      
        ndviValues.size().evaluate(function(sampleSize) {
          var pValue = calculatePValue(correlation, sampleSize);
          print('NDVI ve Yükseklik Korelasyonu p-değeri:', pValue);

         
          var ndviElevationChart = ui.Chart.array.values({
            array: ndviValues,
            axis: 0,
            xLabels: elevationValues
          }).setSeriesNames(['NDVI'])
            .setOptions({
              title: 'NDVI ve Yükseklik İlişkisi',
              hAxis: {title: 'Yükseklik (m)'},
              vAxis: {title: 'NDVI'},
              pointSize: 3,
              trendlines: { 0: {color: 'red'} }
            });

          print(ndviElevationChart);
        });
      } else {
        print('NDVI ve Yükseklik veri noktaları alınamadı.');
      }
    });
  } else {
    print('NDVI ve Yükseklik korelasyonu hesaplanamadı.');
  }
});


var elevationVis = {min: 0, max: 3000, palette: ['green', 'yellow', 'orange', 'red']};
Map.addLayer(dem.reproject({crs: 'EPSG:4326', scale: 100}), elevationVis, 'Yükseklik');


var ndviVis = {min: -1, max: 1, palette: ['blue', 'white', 'green']};
Map.addLayer(indexCollection.select('NDVI').mean().reproject({crs: 'EPSG:4326', scale: 100}), ndviVis, 'Ortalama NDVI');


var modisNDVI = ee.ImageCollection('MODIS/006/MOD13Q1')
  .filterDate(startDate, endDate)
  .filterBounds(geometry)
  .select('NDVI')
  .map(function(image) {
    return image.multiply(0.0001).set('system:time_start', image.get('system:time_start'));
  });

var sentinel2NDVI = indexCollection.select('NDVI');


var ndviDifference = ee.ImageCollection(sentinel2NDVI.map(function(s2Image) {
  var s2Date = s2Image.date();
  var modisImage = ee.Image(modisNDVI.filterDate(s2Date, s2Date.advance(1, 'day')).first());

  var diff = ee.Algorithms.If(modisImage,
    s2Image.subtract(modisImage).rename('NDVI_diff').copyProperties(s2Image, ['system:time_start']),
    ee.Image.constant(0).rename('NDVI_diff').set('system:time_start', s2Image.get('system:time_start'))
  );
  return ee.Image(diff);
})).filter(ee.Filter.notNull(['NDVI_diff']));


var meanNDVIDifference = ndviDifference.mean();
Map.addLayer(meanNDVIDifference, 
  {min: -0.5, max: 0.5, palette: ['blue', 'white', 'red']}, 
  'Ortalama Sentinel-2 NDVI - MODIS NDVI Farkı');


var ndviDiffChart = ui.Chart.image.series({
  imageCollection: ndviDifference,
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 250
}).setOptions({
  title: 'Sentinel-2 ve MODIS NDVI Farkı Zaman Serisi',
  vAxis: {title: 'NDVI Farkı'},
  hAxis: {title: 'Tarih'},
  lineWidth: 1,
  pointSize: 3
});

print(ndviDiffChart);


Map.centerObject(geometry, 10);


var seasonalDecomposition = function(collection, band) {
  var years = ee.List.sequence(2018, 2019);
  var months = ee.List.sequence(1, 12);
  
  var annualMeans = years.map(function(year) {
    return collection.filter(ee.Filter.calendarRange(year, year, 'year'))
      .select(band).mean().set('year', year);
  });
  
  var monthlyMeans = months.map(function(month) {
    return collection.filter(ee.Filter.calendarRange(month, month, 'month'))
      .select(band).mean().set('month', month);
  });
  
  return {
    annual: ee.ImageCollection.fromImages(annualMeans),
    seasonal: ee.ImageCollection.fromImages(monthlyMeans)
  };
};

var ndviDecomposition = seasonalDecomposition(indexCollection, 'NDVI');
print(ui.Chart.image.series(ndviDecomposition.annual, geometry, ee.Reducer.mean(), 1000, 'year')
  .setOptions({title: 'Annual Mean NDVI'}));
print(ui.Chart.image.series(ndviDecomposition.seasonal, geometry, ee.Reducer.mean(), 1000, 'month')
  .setOptions({title: 'Monthly Mean NDVI'}));

var calculateEVI2 = function(image) {
  var evi2 = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 2.4 * RED + 1))', {
      'NIR': image.select('B8'),
      'RED': image.select('B4')
    }).rename('EVI2');
  return image.addBands(evi2).set('system:time_start', image.get('system:time_start'));
};


var evi2Collection = sentinel2
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 5))
  .map(maskS2clouds)
  .map(calculateEVI2);


var so2Collection = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_SO2')
  .select('SO2_column_number_density')
  .filterDate('2018-01-01', '2019-12-31')
  .filterBounds(geometry);


var combinedCollection = evi2Collection.map(function(image) {
  var date = image.get('system:time_start');
  var so2Image = so2Collection.filterDate(date, ee.Date(date).advance(1, 'day')).first();
  return image.addBands(so2Image.rename('SO2')).select(['EVI2', 'SO2']);
});


var correlation = combinedCollection.reduce(ee.Reducer.pearsonsCorrelation());


var correlationChart = ui.Chart.image.series({
  imageCollection: combinedCollection.select(['EVI2', 'SO2']),
  region: geometry,
  reducer: ee.Reducer.pearsonsCorrelation(),
  scale: 30
}).setOptions({
  title: 'EVI2 ve SO2 Korelasyonu',
  vAxis: {title: 'Korelasyon'},
  hAxis: {title: 'Tarih'},
  lineWidth: 1,
  pointSize: 3
});

print(correlationChart);


var pValue = correlation.select('p-value');
print('EVI2 ve SO2 p-değeri:', pValue);
 





