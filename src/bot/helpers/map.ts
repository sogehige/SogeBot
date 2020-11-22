// https://stackoverflow.com/questions/29085197/how-do-you-json-stringify-an-es6-map
// Courtesy of https://stackoverflow.com/users/696535/pawel
// https://stackoverflow.com/a/56150320

export const serializeMap = (map: Map<any, any>): string => {
  return JSON.stringify(map, function (key, value) {
    const originalObject = this[key];
    if(originalObject instanceof Map) {
      return {
        dataType: 'Map',
        value: Array.from(originalObject.entries()), // or with spread: value: [...originalObject]
      };
    } else {
      return value;
    }
  });
};

export function unserializeMap<K>(serializedMap: string): K {
  return JSON.parse(serializedMap, function (key, value) {
    if(typeof value === 'object' && value !== null) {
      if (value.dataType === 'Map') {
        return new Map(value.value);
      }
    }
    return value;
  });
}