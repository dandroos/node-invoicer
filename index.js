const { prompt } = require("inquirer");
const Invoice = require("./Invoice");
const config = require("./config.json");

const run = async () => {
  console.clear();
  const { defaults } = config;
  prompt([
    {
      name: "recipient_name",
      type: "input",
      message: "RECIPIENT NAME: ",
      default: defaults.recipient_name,
    },
    {
      name: "recipient_nie",
      type: "input",
      message: "RECIPIENT NIE: ",
      default: defaults.recipient_nie,
    },
    {
      name: "recipient_address",
      type: "input",
      message: "RECIPIENT ADDRESS: ",
      default: defaults.recipient_address,
      suffix: "(Separate with commas)",
    },
    {
      name: "recipient_email",
      type: "input",
      message: "RECIPIENT EMAIL: ",
      default: defaults.recipient_email,
    },
  ]).then(
    async ({
      recipient_name,
      recipient_address,
      recipient_nie,
      recipient_email,
    }) => {
      const items = [];
      const addItem = async () => {
        const itemNumber = items.length + 1;
        const answers = await prompt([
          {
            type: "input",
            name: "item_description",
            message: `DESCRIPTION #${itemNumber}: `,
            default: defaults.description,
          },
          {
            type: "number",
            name: "item_amount",
            message: `AMOUNT #${itemNumber}: `,
          },
        ]);
        return {
          description: answers.item_description,
          amount: answers.item_amount,
        };
      };

      let end = false;
      while (!end) {
        items.push(await addItem());
        await prompt([
          {
            name: "more",
            type: "confirm",
            message: "ADD ANOTHER?",
          },
        ]).then(({ more }) => {
          if (!more) {
            end = true;
          }
        });
      }

      console.log("\nCREATING INVOICE...\n");

      const invoice = new Invoice({
        date: new Date(),
        recipient: recipient_name,
        address: recipient_address,
        nie: recipient_nie,
        email: recipient_email,
        items: items,
        total:
          items.length > 1
            ? items.reduce((pv, cv) => {
                return pv.amount + cv.amount;
              })
            : items[0].amount,
      });
      invoice
        .create()
        .then(() =>
          prompt([
            {
              name: "sendToRecipient",
              type: "confirm",
              message: "EMAIL TO RECIPIENT?",
            },
          ]).then(async ({ sendToRecipient }) => {
            if (sendToRecipient) {
              await invoice.sendToRecipient();
            }
            prompt([
              {
                name: "sendToAccountant",
                type: "confirm",
                message: "EMAIL TO ACCOUNTANT?",
              },
            ]).then(async ({ sendToAccountant }) => {
              if (sendToAccountant) {
                await invoice.sendToAccountant();
              }
              invoice.cleanUp();
            });
          })
        )
        .catch((err) => console.log(err));
    }
  );
};

run();
