# 3DS glb splitter

### Installation
- clone this repo where you want to use it using

```

git clone https://github.com/XPLR3DS/3ds_splitter.git 
```

- install the node modules

```
yarn install
```

- install `ts-node`
```
yarn add ts-node
```
or
```
npm install -g ts-node
```

You can now use the CLI to split GLB files.



### CLI Usage
| Flag | Description | Type | Default | Required |
| --- | --- | --- | --- | --- |
| -i, --input | input GLB file path | String | None | Yes |
| -o, --output | output directory path | String | ./ | No |
| -n, --name | base filename | String | None | Yes |
| -m, --memory_threshold | target memory threshold | Number | 40000000 | No |



##### Example

```
npx ts-node splitter_multi.ts -i ./model/FederatedModel.glb -o ./output/ -n modelName

```

### Output

The output will be a series of modelfiles, and a (name).manifest.json file.

These files are designed to be used with the xeokit tool [xeokit-convert](https://xeokit.github.io/xeokit-convert/docs/).


In testing I have used a modified version of the convert2xkt package to collect data on the split files, contact me if you would like to use it.
