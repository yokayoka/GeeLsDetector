//Calcurate NDVI median value for various satellites for given period
//指定地域の指定期間のNDVIのedianを様々な衛星データについて返す関数
// Sentinel-2(Sn2), Landsat-8(ls8), Landsat-5(ls5)対応版
// 2019/7/4 by Hiromu Daimaru


//以下は関数本体を作動させるために必要な雲マスクとNDVI算出関数
//----------------------------------------
//雲マスクのための関数
// // Sentinel-2 QA bandによる雲マスク関数
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

// Landsat 8のための雲マスク関数
var maskL8 = function(image) {
  var qa = image.select('BQA');
  /// Check that the cloud bit is off.
  // See https://landsat.usgs.gov/collectionqualityband
  var mask = qa.bitwiseAnd(1 << 4).eq(0);
  return image.updateMask(mask);
}

// Landsat 4, 5, 7 surface reflectance 用のQA band による雲マスク関数
var cloudMaskL457 = function(image) {
  var qa = image.select('pixel_qa');
  // If the cloud bit (5) is set and the cloud confidence (7) is high
  // or the cloud shadow bit is set (3), then it's a bad pixel.
  var cloud = qa.bitwiseAnd(1 << 5)
          .and(qa.bitwiseAnd(1 << 7))
          .or(qa.bitwiseAnd(1 << 3))
  // Remove edge pixels that don't occur in all bands
  var mask2 = image.mask().reduce(ee.Reducer.min());
  return image.updateMask(cloud.not()).updateMask(mask2);
};


// Sentinel-2 用のNDVI算出関数
var ndviSn2 = function(image) {
  return image.addBands(image.normalizedDifference(['B8', 'B4']));
};


// Landsat 8 用のNDVI算出関数
var ndviLs8 = function(image) {
  return image.addBands(image.normalizedDifference(['B5', 'B4']));
};

// Landsat 5 用のNDVI算出関数
var ndviLs5 = function(image) {
  return image.addBands(image.normalizedDifference(['B4', 'B3']));
};
//----------------------------------------

//関数本体
//指定した衛星の画像から指定した期間のNDVI中間値を計算する関数
// region: 関心地域, startDate: 開始日, endDate: 終了日,period: satellite: 衛星指定用コード, cloudness: 雲率
function NDVImed(region,startDate, endDate, satellite, cloudness, showImage){
  //開始日の日付を'YYYY-MM-DD'形式で指定する
  var startDay = ee.Date(startDate);
  //終了日の日付を'YYYY-MM-DD'形式で指定する
  var endDay = ee.Date(endDate);

  //応答用変数の宣言
  var ndviMedian;
  //イメージ表示用の文字列
  var imageTitle = startDate + " to " + endDate + " " + satellite;

  switch(satellite){
    case 'sn2':
    //collectionとしてSentinel-2のデータを指定
    var CollectionSn2 = ee.ImageCollection('COPERNICUS/S2')
      .filterDate(startDay, endDay)
      .filterBounds(region)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudness))
      .map(maskS2clouds);

    var MedianSn2 = CollectionSn2.median().clip(region);
      if(showImage == 'show'){
       Map.addLayer(MedianSn2, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, imageTitle);}

    ndviMedian = ndviSn2(MedianSn2).select('nd');
    //print(ndviMedian);
    break;

    case 'ls8':
      var CollectionLs8 = ee.ImageCollection('LANDSAT/LC08/C01/T1_TOA')
      //var CollectionLs8 = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
      .filterDate(startDay, endDay)
      .filterBounds(region)
      .filter(ee.Filter.lt('CLOUD_COVER', cloudness))
      .map(maskL8);

      var MedianLs8 = CollectionLs8.median().clip(region);
        if(showImage == 'show'){
        Map.addLayer(MedianLs8, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, imageTitle);}
      ndviMedian = ndviLs8(MedianLs8).select('nd');

      break;

    case 'ls5':
      //var CollectionLs5 = ee.ImageCollection('LANDSAT/LT05/C01/T1_TOA')
      var CollectionLs5 = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
      .filterDate(startDay, endDay)
      .filterBounds(region)
      .filter(ee.Filter.lt('CLOUD_COVER', cloudness))
      .map(cloudMaskL457);

      var MedianLs5 = CollectionLs5.median().clip(region);
        if(showImage == 'show'){
        Map.addLayer(MedianLs5, {bands: ['B3', 'B2', 'B1'], min: 0, max: 3000}, imageTitle);}
      ndviMedian = ndviLs5(MedianLs5).select('nd');
      break;

    default:
    break;
  }
    return ndviMedian
}
//----------------------------------------


//以下関数を利用した差分解析の例
//高知県北部大豊町から東部北川村付近をroiに指定
//var roi = ee.Geometry.Rectangle(133.37, 33.69, 133.88, 33.90);
var roi = ee.Geometry.Rectangle(133.37, 33.50, 134.23, 33.90);

// 2011年７月の災害を想定
var bf0 = NDVImed(roi,'2010-07-20', '2010-09-30', 'ls5', 10, 'show');
var af0 = NDVImed(roi,'2011-07-20', '2011-10-30', 'ls5', 10, 'show');

// 2018年の災害を想定
var bf = NDVImed(roi,'2015-05-01', '2017-10-30', 'ls8', 5, 'show');
var af = NDVImed(roi,'2018-07-10', '2019-06-28', 'sn2', 2, 'show');
Map.centerObject(roi);


var ndviDef0 = af0.subtract(bf0);
var ndviDef = af.subtract(bf);

//2018年豪雨前後の画像の比較から崩壊分布図を作成
//NDVIの変化が0.3以上の場所に１を与えるラスターを作成
var degr = ndviDef.expression('(ND < -0.3) * 1', {'ND': ndviDef.select('nd')});
var vizParamDeg = {bands: ['nd'],min: 0, max: 1.0, palette: ['FFFFFF', 'FF0000']};

//同様に2011年災害時の崩壊分布図を作成
var degr0 = ndviDef0.expression('(ND < -0.3) * 1', {'ND': ndviDef.select('nd')});


//崩壊地の表示
Map.addLayer(degr, vizParamDeg, '2018 landslides from ndvi change');
Map.addLayer(degr0, vizParamDeg, '2011 landslides from ndvi change');
