const Line = require('./Line.js')
const { GoogleSpreadsheet } = require('google-spreadsheet')
const Q = require('q')

const GSReader = function(spreadsheetKey, sheetsFilter) {
  this._sheet = new GoogleSpreadsheet(spreadsheetKey)
  this._sheetsFilter = sheetsFilter

  this._fetchDeferred = Q.defer()
  this._isFetching = false
  this._fetchedWorksheets = null
}

GSReader.builder = async function(apiKey, spreadsheetKey, sheetsFilter) {
  const reader = new GSReader(spreadsheetKey, sheetsFilter)
  await reader._sheet.useApiKey(apiKey)

  return reader
}

GSReader.prototype.fetchAllCells = async function() {
  const self = this

  if (self._fetchedWorksheets == null) {
    if (!self._isFetching) {
      self._isFetching = true

      try {
        await self._sheet.loadInfo()
      } catch (err) {
        console.error('Error while fetching the Spreadsheet (' + err + ')')
        console.warn('WARNING! Check that your spreadsheet is "Published" in "File > Publish to the web..."')

        self._fetchDeferred.reject(err)
      }

      const sheets = self._sheet.sheetsByIndex

      const worksheetReader = new WorksheetReader(self._sheetsFilter, sheets)

      self._fetchedWorksheets = await worksheetReader.next()

      self._fetchDeferred.resolve(self._fetchedWorksheets)
    }

    return this._fetchDeferred.promise
  } else {
    return self._fetchedWorksheets
  }
}

GSReader.prototype.select = async function(keyCol, valCol, fallbackValCol) {
  const self = this

  const cells = await self.fetchAllCells()

  return self.extractFromRawData(cells, keyCol, valCol, fallbackValCol)
}

GSReader.prototype.extractFromRawData = function(rawWorksheets, keyCol, valCol, fallbackValCol) {
  const extractedLines = []

  for (let i = 0; i < rawWorksheets.length; i++) {
    const extracted = this.extractFromWorksheet(rawWorksheets[i], keyCol, valCol, fallbackValCol)
    extractedLines.push.apply(extractedLines, extracted)
  }
  return extractedLines
}

GSReader.prototype.extractFromWorksheet = function(rawWorksheet, keyCol, valCol, fallbackValCol) {
  let results = [];

  // const rows = this.flatenWorksheet(rawWorksheet);
  const rows = rawWorksheet

  const headers = rows[0];

  if (headers) {
    let keyIndex = -1
    let valIndex = -1;
    let fallbackValIndex = -1;
    for (let i = 0; i < headers.length; i++) {
      const value = headers[i].value;
      if (value === keyCol) {
        keyIndex = i;
      }
      if (value === valCol) {
        valIndex = i;
      }

      if (value === fallbackValCol) {
        fallbackValIndex = i;
      }
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      if (row) {
        try {
          const keyValue = row[keyIndex].value;
          const valValue = row[valIndex].value;
          const fallbackValValue = row[fallbackValIndex].value;
          if (keyValue) {
            let normalizedValValue = valValue != null ? valValue : fallbackValValue;
            results.push(new Line(keyValue, normalizedValValue));
          }

        } catch (err) {

        }
      }
    }
  }

  return results;
}

GSReader.isAllSheets = function(sheet) {
  return !sheet || sheet === '*';
};

GSReader.shouldUseWorksheet = function(selectedSheets, title, index) {
  if (GSReader.isAllSheets(selectedSheets)) {
    return true;
  } else {
    const selectedArray = forceArray(selectedSheets);
    for (let i = 0; i < selectedArray.length; i++) {
      const a = selectedArray[i];

      if (typeof (a) == "number" && index === a) {
        return true;
      } else if (typeof (a) == "string" && title === a) {
        return true;
      }
    }
    return false;
  }
}

const WorksheetReader = function(filterSheets, worksheets) {
  this._filterSheets = filterSheets
  this._worksheets = worksheets
  this._index = 0

  this._data = []
}

WorksheetReader.prototype.next = async function() {
  const self = this;

  if (this._index < this._worksheets.length) {
    const index = this._index++;
    const currentWorksheet = this._worksheets[index];

    if (GSReader.shouldUseWorksheet(this._filterSheets, currentWorksheet.title, index)) {
      try {
        await currentWorksheet.loadCells()

        self._data.push(currentWorksheet._cells)
      } catch (err) {
        console.error(err)
      }

      return self.next()
    } else {
      return this.next()
    }
  } else {
    return this._data
  }
}

var FakeReader = function(array) {
  this._array = array;
  this._index = 0;
};

FakeReader.prototype.select = function(sheets, keyCol, keyVal, cb) {
  var self = this;
  var target = [];

  this._array.forEach(function(key) {
    var v = self._array[key];

    target.push(new Line(v[keyCol], v[keyVal]));
  });

  cb(target);
};

var forceArray = function(val) {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  return [val];
}

module.exports = {
  GS:   GSReader,
  Fake: FakeReader
}


