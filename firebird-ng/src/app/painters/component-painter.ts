interface ComponentPainter {
    createFromObject(source: any): any;
    toModel(source: any): any;
    renderAtTime(source: any): any;
    renderNoTime(source: any): any;

}
