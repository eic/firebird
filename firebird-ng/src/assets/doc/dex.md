
# Firebird Data Exchange format

Data exchange is both JSON and Javascript object compatible.

It starts with (in this order) `"type":"firebird-dex-json"`.  
Then goes `version` and `origin` - any custom origin info and a list of entries. They are described below.

Here `event` may correspond to `event` in HENP data, while has more technical definition: 
data container for a time labeled data for particular time interval to be displayed.  

```json
{
  "type":"firebird-dex-json",
  "version": "0.04",
  "origin": {"any custom origin info": "here"},
  "events": [
    event0, event1, ...
  ]
}
```

- **version** - is JSON schema version
- **origin** - designed for any general custom info such as original file name,
  timestamp, simulation software version, etc.
- **events** - list of entries/events. The format is below.

## Event format


```
+------------------------------------------------+
| Event                                          |
|                                                |
|   +--------------------+                       |
|   |   Group            |                       |
|   |    ~name type~     |                       |
|   +--------------------+                       |
|                                                |
|   +-------------------+                        |
|   |      hits a       |        +----------+    |
|   +-------------------+        |  hits b  |    |
|                                +----------+    |
|   +----------------------------------+         |
|   |      trajectories c              |         |
|   +----------------------------------+         |
|                                                |
+------------------------------------------------+

0------------------------------------------------> time


```

Event is an object with `id` and `groups` properties.
By design groups represent different hits, tracks, vertices, collections, etc.
While can be any arbitary data, that will be further rendered by the frontend.

```json
{
  "id": "Event number or string - unique name",
  "groups": [
    
   ...
    
  ]
}
```

Requrired fields are `id` and `groups`. `id` must be unique across events in FDEX file. 


## Group format

- `name`: unique string id
- `type`: string with type (depends on what group will be used in the frontend to render it)
- `origin`: optional dictionary with origin data info such as type of origin, 
   e.g. "edm4eic::TrackerHitData", EDM collection name and so on

- all other fields defined by "type"

So far example of exchange format looks like (only required fields are used here):

```json
{
  "version": "0.04",
  "events": [
    {
      "id": "event 0",
      "groups": [
        {
          "name": "BarrelVertexHits",
          "type": "BoxHit",
          "origin": {"type": "edm4eic::TrackerHitData", "name": "MPGDBarrelRecHits"},
           ...,
        },
        ...
      ]
    },
    ...
  ]
}
```

## BoxHit group

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
"groups": [
{
  "name": "MPGDBarrelRecHits",
  "type": "BoxHit",
  "origin": {"type": "edm4eic::TrackerHitData", "name": "MPGDBarrelRecHits"}
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
...]
}]
```

## Trajectory group

Trajectories that are built based on lines connecting points.

```json
      "groups": [
        {
          "name": "CentralTrackSegments",
          "type": "PointTrajectory",
          "origin": { "type": ["edm4eic::TrackPoint","edm4eic::TrackSegment"]}
          "paramColumns": [".."], // Param columns should correspond to what is written in line/track params
          "pointColumns": ["x", "y", "z", "t", "dx", "dy", "dz", "dt"] 
              
          "trajectories": [
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

## HomoHisto2D group

Square 2D histogram where elements are of the same size and arranged over cols and plots.
The value of each histogram bin can change in time

** - 





## TypeScript Event Model


The Firebird Data Exchange model provides a structured way to serialize and deserialize
event data. The model is implemented in TypeScript and designed to be extensible by users, 
so they could add their own custom groups without modifying the core parsing logic.

The implementation TypeScript classes mirror the data exchange format 
and provide methods for serialization and deserialization.

- **DataExchange** class - Represents the entire data exchange object.
- **Event** class - Represents an individual event.
- **EventGroup** abstract class - A base class representing a generic group. Described below.

It Typescript Firebird Data Exchange often referenced as Dex (Data EXchange) or FDEX. E.g.
`toDexObject`, `fromDexObject`. `DexObject` is a JS object, that if serialized to JSON
would correspond a part of DataExchangeFormat. E.g. Dex BoxHit will have `pos`, `dim` etc.

What is JSON DEX and Typescript data model difference? 

In general JSON format is very close to object definition in JS => TS.
But despite that, Firebird JSON format is just a data exchange layer and when deserialized from
JSON is not designed to be a 100% a convenient to work with JS data structure.
More over, it lacks some methods and abstractions, that our domain data-model should have,
such as links between event model and three.js rendering tree objects.

Summarizing:

- Firebird Data Exchange - is JSON schema shaping data exchange between backend and frontend
- DexObject - JSON parsed to JS object
- TypeScript event model - Frontend set of classes mimicking DexObject structure but designed
  to be convenient in terms of the frontend API


### EventGroups machinery

Different collection of objects such as hits, tracks, vertexes, etc.
that firebird can work with are represented as various **group-s**.
Each type derive from `EventGroup` and registered in a system.
Then corresponding `Painter`-s classes know how to render/paint them, there are rules how
to display them in tables, etc. Corresponding `Component`class can show GUI configuring configs, etc. 

- **EventGroup**  An abstract class representing a generic group.
- Contains common properties:
  - `name`: Unique identifier.
  - `type`: group type (used for determining the appropriate factory).
  - `origin`: Optional string indicating the origin type.
- Declares an abstract method `toDexObject()` that must be implemented by subclasses.

- **EventGroupFactory Interface**: Defines a factory for creating `EventGroup`
  instances from Dex objects - deserialized data.
- **group Registry**: A mapping of group types to their corresponding factories.
- Functions:
  - `registergroupFactory(factory: EventGroupFactory)`: Registers a new factory.
  - `getgroupFactory(type: string)`: Retrieves a factory based on the group type.


## Extending the Model

### Adding a New group Type

To add a new group type, follow these steps:

1. **Create a New group Class**: Extend `EventGroup` and implement the `toDexObject()` method.

   ```typescript
   export class Customgroup extends EventGroup {
     static type = 'CustomType';
     // Define additional properties

     constructor(name: string, /* additional parameters */, origin?: string) {
       super(name, Customgroup.type, origin);
       // Initialize additional properties
     }

     toDexObject(): any {
       return {
         name: this.name,
         type: this.type,
         origin: {type: this.origin},
         // Serialize additional properties
       };
     }
   }
   ```

2. **Create a Factory for the group**: Implement `EventGroupFactory` for your group.

   ```typescript
   export class CustomgroupFactory implements EventGroupFactory {
     type: string = Customgroup.type;

     fromDexObject(obj: any): EventGroup {
       const name = obj["name"];
       // Extract additional properties
       const origin = obj["origin"];

       // Validate required fields
       if (!name /* || missing other required fields */) {
         throw new Error("Missing required fields in Customgroup");
       }

       return new Customgroup(name, /* additional parameters */, origin);
     }
   }
   ```

3. **Register the Factory**: Use the `registerGroupFactory()` function to register your group factory.

   ```typescript
   // Register the custom group factory
   registergroupFactory(new CustomgroupFactory());
   ```

4. **Update JSON Parsing Logic**: No need to modify existing parsing logic. The registry will dynamically resolve the new group type.

