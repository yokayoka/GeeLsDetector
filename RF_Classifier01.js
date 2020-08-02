// Earth EngineのRandom Forestで新規発生崩壊地を検出する
// 18 Jan. 2020 by H. Daimaru
// // Function to mask clouds using the Sentinel-2 QA band.
function maskS2clouds(image) {
  var qa = image.select('QA60')

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = ee.Number(2).pow(10).int()
  var cirrusBitMask = ee.Number(2).pow(11).int()

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
            qa.bitwiseAnd(cirrusBitMask).eq(0))

  // Return the masked and scaled data, without the QA bands.
  return image.updateMask(mask).divide(10000)
      .select("B.*")
      .copyProperties(image, ["system:time_start"])
}

// This function gets NDVI from Sentinel-2 imagery.
var ndviSn2 = function(image) {
  return image.addBands(image.normalizedDifference(['B8', 'B4']));
}


// This function adds NDVI and NDWI bands to Sentinel-2 images.
function addNDVIBands(image) {
  var NDVI = image.addBands(image.normalizedDifference(['B8', 'B4']));
  var NDWI = NDVI.addBands(NDVI.normalizedDifference(['B8', 'B12']));
  var renamedND = NDWI.select(
    ['B1', 'B2','B3','B4', 'B5','B6', 'B7', 'B8', 'B8A', 'B9', 'B10', 'B11', 'B12', 'nd', 'nd_1'], // old names
    ['B1', 'B2','B3','B4', 'B5','B6', 'B7', 'B8', 'B8A', 'B9', 'B10', 'B11', 'B12', 'ndvi', 'ndwi'])               // new names
  return renamedND;
}

//東広島付近をroiに指定
var roi = ee.Geometry.Rectangle(132.647, 34.277, 132.763, 34.33);

var eventDay = ee.Date('2018-07-20');
var endDay = ee.Date('2018-08-30');
//雲率の閾値
var cloudness =50;

//災害後のcollectionとしてSentinel-2のデータを指定
var afCollection = ee.ImageCollection('COPERNICUS/S2')
    .filterDate(eventDay, endDay)
    .filterBounds(roi)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudness))
    .map(maskS2clouds);

//災害後のメディアン値とNDVI, NDWIバンドの追加
var afComposite = afCollection.median().clip(roi);
var afND = addNDVIBands(afComposite);

//災害前のNDVIを計算する期間を指定
var bfStart = ee.Date('2017-04-01');
var bfEnd = ee.Date('2017-06-27');

//災害前のcollectionとしてSentinel-2のデータを指定
var bfCollection = ee.ImageCollection('COPERNICUS/S2')
    .filterDate(bfStart, bfEnd)
    .filterBounds(roi)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudness))
    .map(maskS2clouds);

//災害前のメディアン値を計算
var bfComposite = bfCollection.median().clip(roi);
var bfND = addNDVIBands(bfComposite);

//ファイルのチェック

//print(bfND);
//print(afND);

//災害後-災害前の計算
var ndviChange = afND.select('ndvi').subtract(bfND.select('ndvi'));
//print(ndviChange);
var ndwiChange = afND.select('ndwi').subtract(bfND.select('ndwi'));
//print(ndwiChange);

var afNDcng = afND.addBands(ndviChange.select('ndvi'));

var afNDcng = afNDcng.addBands(ndwiChange.select('ndwi'));
print(afNDcng);
//このファイルをデータとする
//var image = afND;
// print(afNDcng);
var image = afNDcng;

/**************************
Random Forests Classification
****************************/
// Assetsでuploadした土地分類のシェープファイルを教師用のポリゴンとして指定
var Polygons = ee.FeatureCollection('users/hiromudaimaru/land');
//var fc = ee.FeatureCollection('TIGER/2016/Roads');
Map.addLayer(Polygons, {color: 'FF0000'}, "Polygons");

// Train Sample Data
// NDVI, NDWIの変化（nd）を使う場合
//var bands = ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B8', 'B8A', 'B9', 'B10', 'B11', 'B12', 'ndvi', 'ndwi', 'ndvi_1', 'ndwi_1'];
// NDVI, NDWIの変化（nd）を使わない場合
//var bands = ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B8', 'B8A', 'B9', 'B10', 'B11', 'B12', 'ndvi', 'ndwi'];

//全バンドを取得してリストを表示
var bands=image.bandNames();
print(bands);

var input = image.select(bands);
//用意したポリゴンを用いて教師用データを作成
var classifierTraining = input.select(bands)
    .sampleRegions({
      collection: Polygons,
      properties: ['class'],
      scale: 10
    });


// //Classification Model
// //The choice of classifier is not always obvious, but a CART (a decision tree when running
// //in classification mode) is not a crazy place to start.  Instantiate a CART and train it:
var classifier = ee.Classifier.randomForest(10).train({
  features: classifierTraining,
  classProperty: 'class',
  inputProperties: bands
});

// //Classify the image
var classified = input.select(bands).classify(classifier);

// /*Land Cover Classes
// 0 = water,
// 1 = landslide,
// 2 = urban,
// 3 = crop,
// 4 = forest
// */
// // Define a palette for the IGBP classification.
var igbpPalette = [
  '0000FF',  //water
  '964B00', //NewSlide
  'CCFF66', //urban
  '00FF00', //crop
  '00FFFF', //forest
];

//表示パラメータ
var truecolorVis = {
  min: 0.0,
  max: 0.3,
  bands: ['B4', 'B3', 'B2'],
};
//災害後のTrueColor画像の表示
Map.addLayer(afND, truecolorVis, 'afterHazard');


Map.addLayer(classified, {palette: igbpPalette, min: 1, max: 6}, 'classification');
Map.centerObject(roi, 14);

//元データをGoogleドライブに出力する
Export.image.toDrive({
  image: image,
  description: 'Sentinel-2 image after 2018 hazard in Hiroshima',
  scale: 10,
  region: roi
});

//分類結果をGoogleドライブに出力する
Export.image.toDrive({
  image: classified,
  description: 'Landslides by 2018 storm in east Hiroshima',
  scale: 10,
  region: roi
});

// 教師データをラスターに変換
var landAreaImg = Polygons
  .filter(ee.Filter.notNull(['class']))
  .reduceToImage({
    properties: ['class'],
    reducer: ee.Reducer.first()
}).clip(roi);

//教師データをGoogleドライブに出力する
Export.image.toDrive({
  image: landAreaImg,
  description: 'Training_Data_2018_Hiroshima',
  scale: 10,
  region: roi
});
