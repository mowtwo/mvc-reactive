import { Controller, setup } from "./Active.js";

class ActiveController extends Controller {
  static reactive = {
    count: 0,
    index: 1,
    width: 200
  }
  constructor(reactive) {
    super(reactive)
  }
  inc(e, dataset) {
    console.log(dataset)
    console.log('inc')
    this.setState('count', this.getState('count') + 1)
    this.setState('index', this.getState('index') + 1)
    this.setState('width', this.getState('width') + 10)
  }
}

setup([ActiveController])
