export default abstract class Persist {
    constructor(timeout?) {}
    abstract newMap();
    abstract getMap();
}

abstract class PersMap {
    constructor() {
    }
}