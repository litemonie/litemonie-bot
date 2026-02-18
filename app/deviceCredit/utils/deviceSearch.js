module.exports.smartSearch = function smartSearch(devices, input) {
  if (!input || typeof input !== 'string') {
    return null;
  }
  
  const searchText = input.trim().toLowerCase();
  console.log(`🔍 Smart device search for: "${searchText}"`);
  
  // Multiple matching strategies
  const matches = [];
  
  for (const device of devices) {
    const deviceIdLower = device.id.toLowerCase();
    const makeLower = device.make.toLowerCase();
    const modelLower = device.model.toLowerCase();
    const simpleId = deviceIdLower.replace(/_/g, '');
    
    // 1. Exact ID match (highest priority)
    if (deviceIdLower === searchText) {
      matches.push({ device, score: 100 });
      continue;
    }
    
    // 2. ID without underscores match
    if (simpleId === searchText) {
      matches.push({ device, score: 95 });
      continue;
    }
    
    // 3. Partial ID match
    if (deviceIdLower.includes(searchText) || simpleId.includes(searchText)) {
      matches.push({ device, score: 80 });
      continue;
    }
    
    // 4. Make + Model combination
    const makeModelKey = `${makeLower}_${modelLower.replace(/\s+/g, '_')}`;
    if (makeModelKey.includes(searchText.replace(/\s+/g, '_'))) {
      matches.push({ device, score: 70 });
      continue;
    }
    
    // 5. Make + Model without spaces/underscores
    const compactMakeModel = `${makeLower}${modelLower}`.replace(/\s+|_/g, '');
    if (compactMakeModel.includes(searchText.replace(/\s+/g, ''))) {
      matches.push({ device, score: 60 });
      continue;
    }
    
    // 6. Just model match
    if (modelLower.includes(searchText)) {
      matches.push({ device, score: 50 });
      continue;
    }
    
    // 7. Just make match
    if (makeLower === searchText) {
      matches.push({ device, score: 40 });
      continue;
    }
  }
  
  // Sort by score and return best match
  matches.sort((a, b) => b.score - a.score);
  
  if (matches.length > 0) {
    console.log(`✅ Found ${matches.length} possible matches, best score: ${matches[0].score}`);
    return matches[0].device;
  }
  
  console.log(`❌ No matches found for: "${searchText}"`);
  return null;
};

module.exports.searchByBrand = function searchByBrand(devices, brand) {
  const brandLower = brand.toLowerCase();
  return devices.filter(device => 
    device.make.toLowerCase().includes(brandLower) && 
    device.isAvailable()
  );
};

module.exports.searchByModel = function searchByModel(devices, model) {
  const modelLower = model.toLowerCase();
  return devices.filter(device => 
    device.model.toLowerCase().includes(modelLower) && 
    device.isAvailable()
  );
};

module.exports.searchByPriceRange = function searchByPriceRange(devices, minPrice = 0, maxPrice = Infinity) {
  return devices.filter(device => 
    device.sellingPrice >= minPrice && 
    device.sellingPrice <= maxPrice && 
    device.isAvailable()
  );
};

module.exports.getBrands = function getBrands(devices) {
  const brands = new Set();
  devices.forEach(device => {
    brands.add(device.make);
  });
  return Array.from(brands).sort();
};

module.exports.getModelsByBrand = function getModelsByBrand(devices, brand) {
  return devices
    .filter(device => device.make.toLowerCase() === brand.toLowerCase())
    .map(device => device.model)
    .filter((model, index, self) => self.indexOf(model) === index);
};