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

## HitBox component

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

