export default abstract class Persist {
    constructor(timeout?: any);
    abstract newMap(): any;
    abstract getMap(): any;
}
