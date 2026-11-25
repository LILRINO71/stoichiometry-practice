# Stoichiometry Practice

Random high school chemistry practice problems, in a single web page that works on a phone.

- **Mole ratio**: convert between amounts of two substances in a balanced equation.
- **Limiting reactant**: pick the limiting reactant and find the amount of product.

Amounts are given and asked in moles or grams. Each answer is checked (within 1.5%), followed by a worked solution. The score lasts until the page is reloaded.

## Run it

Open `index.html` in a browser. There is no build step, backend or tracking.

## Test it

```
node test.js
```

Checks that every equation is balanced by atom count, then independently recomputes the answers for 100,000 random problems and exercises the answer checker.
