# Log on to computer

* Select "Sign-in Options"
* Select the "key" icon
* **Username**: mcstudent2025
* **Password**: Welcome2025!

# Bear grid https://shorturl.at/fYZdJ
# Notes https://shorturl.at/OAlhL
## Notes
* The grid is 29 rows by 44 columns



## Code samples
```js
async function setup() {
  await setName('Rex')
  await goTo(14, 22)
}
```

```js
let count = 0
async function setup() {
  await setName('Rex')
  await goTo(14, 22)
}

async function draw() {
  if (count < 5) {
    await moveRight()
  }
  count = count + 1
}
```

```js
async function setup() {
  await moveRight(1)
  await setColor('rgb(255,0,0)')
  await moveRight(1)
  await setColor('rgb(255,0,0)')
}                                 

async function draw() {

}
```
