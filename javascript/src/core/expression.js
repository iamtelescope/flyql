import { tryConvertToNumber } from "./utils.js";
import { FlyqlError } from "./exceptions.js";
import { VALID_KEY_VALUE_OPERATORS } from "./constants.js";
import { Key } from "./key.js";

export class Expression {
  constructor(key, operator, value, valueIsString = null) {
    if (!VALID_KEY_VALUE_OPERATORS.includes(operator)) {
      throw new FlyqlError(`invalid operator: ${operator}`);
    }

    if (!key.segments || key.segments.length === 0) {
      throw new FlyqlError("empty key");
    }

    this.key = key;
    this.operator = operator;

    if (valueIsString === false) {
      this.value = tryConvertToNumber(value);
    } else if (valueIsString === true) {
      this.value = value;
    } else {
      this.value = tryConvertToNumber(value);
    }
  }

  toString() {
    return `${this.key.raw}${this.operator}${this.value}`;
  }
}
