# EIC Phoenix based event display

[![Frontend CI/CD Workflow](https://github.com/eic/firebird/actions/workflows/frontend.yaml/badge.svg?branch=main)](https://github.com/eic/firebird/actions/workflows/frontend.yaml)


Visit working display: 

https://eic.github.io/firebird/


## Development server

Run `ng serve` in `firebird-ng` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

# Firebird Data Exchange format

Data exchange is both JSON and Javascript object compatible.

It starts with version, any custom origin info and a list of entries.
In HENP physics `entry` may correspond to `event` data.

```json
{    
        "version": "0.01",
        "origin": {any custom origin info here"},
        "entries": [
          entry1, entry2, ...
        ]
}
```

- **version** - is JSON schema version
- **origin** - designed for any general custom info such as original file name, 
  timestamp, simulation software version, etc.
- **entries** - list of entries/events. The format is below.

## Entry format

Entry is an object with `id` and `components` properties.
By design components represent different hits, tracks, vertices, collections, etc. 
While can be any arbitary data, that will be further rendered by the frontend.

```json
{
  "id": "entry number or unique string",
  "components": [
    
   ...
    
  ]
}
```

requrired fields are `id` and `components`.


## Component format

- "name": unique string id 
- "type": string with type (depends on what component will be used in the frontend to render it)
- "originType": optional string with type of origin, e.g. "edm4eic::TrackerHitData",
- all other fields are depend on "type"

So far example of exchange format looks like (only required fields are used here):

```json
{
  "version": "0.01",
  "entries": [
    {
      "id": "event 0",
      "components": [
        {
          "name": "BarrelVertexHits",
          "type": "HitBox",
           ...,
        },
        ...
      ]
    },
    ...
  ]
}
```

## BoxTrackerHit component

```json
{
  "pos": [1, 2, 3],
  "dim": [10, 10, 1],
  "t": [4, 1],
  "ed": [0.001, 0.0001]
}
```
Hit has

- "pos": position [mm]  (x, y, z),
- "dim": box dimensions [mm] (dx, dy, dz),
- "t": time information [ns] (time, err_time),
- "ed": energy deposit with error [GeV] (edep, err_edep)

Example

```json
"components": [
{
  "name": "MPGDBarrelRecHits",
  "type": "BoxTrackerHit",
  "originType": "edm4eic::TrackerHitData",
  "hits": [
    {
      "pos": [-567, -84.1, -908],
      "dim": [0.05,  0.04,  0.0],
      "t":   [-10.6, 10.0],
      "ed":  [2e-06,  0.0]
    },
    {
      "pos": [368, -424, 406],
      "dim": [0.05, 0.045, 0.0],
      "t":   [33, 10],
      "ed":  [9e-06, 0.0]
    },
...
}]

```

## TrackerLinePointTrajectory component

Trajectories that are built based on points. 

```json
      "components": [
        {
          "name": "CentralTrackSegments",
          "type": "TrackerLinePointTrajectory",
          "originType": ["edm4eic::TrackPoint","edm4eic::TrackSegment"],
          "paramColumns": [".."], // Param columns should correspond to what is written in line/track params
          "pointColumns": ["x", "y", "z", "t", "dx", "dy", "dz", "dt"] 
              
          "lines": [
              {
                  points: [
                  [x, y, z, t, dx, dy, dz, dt],
                  [x, y, z, t, dx, dy, dz, dt],
                  ... // all points go here
                  ],
                  params: [...]   // values to parameter columns here
              },
              ...  // other lines
          ]
        ...
      ]
```

## TypeScript Event Model


The Firebird Data Exchange model provides a structured way to serialize and deserialize 
event data. This model is implemented in TypeScript and designed to be extensible, 
allowing users to add their own custom components without modifying the core parsing logic. 

The implementation consists of several TypeScript classes and interfaces that mirror the data exchange
format and provide methods for serialization and deserialization. 

- **DataExchange** class - Represents the entire data exchange object.
- **Entry** class - Represents an individual event entry.
- **EntryComponent** abstract class - A base class representing a generic entry component. Described below.

It Typescript Firebird Data Exchange often referenced as Dex (Data EXchange). E.g. 
`toDexObject`, `fromDexObject`. `DexObject` is a JS object, that if serialized to JSON
would correspond a part of DataExchangeFormat. E.g. Dex HitBox will have `pos`, `dim` etc.

We can put it differently. In general JSON format is very close to object definition in JS => TS.
But despite that, Firebird JSON format is just a data exchange layer and when deserialized from
JSON is not designed to be a 100% a convenient to work with JS data structure. 
More over, it lacks some methods and abstractions, that our domain data-model should have, 
such as links between event model and three.js rendering tree objects. 

Summarizing:

- Firebird Data Exchange - is JSON schema shaping data exchange between backend and frontend
- DexObject - JSON parsed to JS object
- TypeScript event model - Frontend set of classes mimicking DexObject structure but designed
  to be convenient in terms of the frontend API


### EntryComponent machinery

Different collection of objects such as hits, tracks, vertexes, etc. 
that firebird can work with are represented as various event or Entry Component-s.
Each type derive from EntryComponent and registered in a system. 
Then corresponding Painters classes know how to render/paint them, there are rules how 
to display them in tables, etc. 

- **EntryComponent**  An abstract class representing a generic entry component.
- Contains common properties:
  - `name`: Unique identifier.
  - `type`: Component type (used for determining the appropriate factory).
  - `originType`: Optional string indicating the origin type.
- Declares an abstract method `toDexObject()` that must be implemented by subclasses.

- **EntryComponentFactory Interface**: Defines a factory for creating `EntryComponent` 
  instances from Dex objects - deserialized data.
- **Component Registry**: A mapping of component types to their corresponding factories.
- Functions:
  - `registerComponentFactory(factory: EntryComponentFactory)`: Registers a new factory.
  - `getComponentFactory(type: string)`: Retrieves a factory based on the component type.


## Extending the Model

### Adding a New Component Type

To add a new component type, follow these steps:

1. **Create a New Component Class**: Extend `EntryComponent` and implement the `toDexObject()` method.

   ```typescript
   export class CustomComponent extends EntryComponent {
     static type = 'CustomType';
     // Define additional properties

     constructor(name: string, /* additional parameters */, originType?: string) {
       super(name, CustomComponent.type, originType);
       // Initialize additional properties
     }

     toDexObject(): any {
       return {
         name: this.name,
         type: this.type,
         originType: this.originType,
         // Serialize additional properties
       };
     }
   }
   ```

2. **Create a Factory for the Component**: Implement `EntryComponentFactory` for your component.

   ```typescript
   export class CustomComponentFactory implements EntryComponentFactory {
     type: string = CustomComponent.type;

     fromDexObject(obj: any): EntryComponent {
       const name = obj["name"];
       // Extract additional properties
       const originType = obj["originType"];

       // Validate required fields
       if (!name /* || missing other required fields */) {
         throw new Error("Missing required fields in CustomComponent");
       }

       return new CustomComponent(name, /* additional parameters */, originType);
     }
   }
   ```

3. **Register the Factory**: Use the `registerComponentFactory()` function to register your component factory.

   ```typescript
   // Register the custom component factory
   registerComponentFactory(new CustomComponentFactory());
   ```

4. **Update JSON Parsing Logic**: No need to modify existing parsing logic. The registry will dynamically resolve the new component type.

