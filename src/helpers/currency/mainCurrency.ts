import { Currency } from '~/database/entity/user';

let _mainCurrency: Currency = 'EUR';

const mainCurrency = {
  set value(value: Currency) {
    _mainCurrency = value;
  },
  get value() {
    return _mainCurrency;
  },
};

export { mainCurrency };