function findInvalidProperty(object, validProperties) {
  let validPropertySet = new Set(validProperties);
  let propertyList = Object.keys(object);
  for (let property of propertyList) {
    if (!validPropertySet.has(property)) {
      return property;
    }
  }
  return null;
}

module.exports = {
  findInvalidProperty
};
