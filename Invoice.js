const { GoogleSpreadsheet } = require("google-spreadsheet");
const NodeGoogleDrive = require("google-drive-connect");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const creds = require("./creds.json");
const config = require("./config.json");
const moment = require("moment");

if (config.lang === "es") {
  moment.locale("es");
}

class Invoice {
  constructor({ date, recipient, address, nie, email, items, total }) {
    this.date = date;
    this.recipient = recipient;
    this.address = address;
    this.nie = nie;
    this.email = email;
    this.items = items;
    this.total = total;
    this.number = null;
    this.filename = null;
  }

  setNumber(number) {
    this.number = String(number).padStart(8, "0");
  }

  setFilename(filename) {
    this.filename = filename;
  }

  async create() {
    await this.updateSpreadsheet();
    this.createPDF();
    await this.uploadToGoogleDrive();
  }

  async updateSpreadsheet() {
    const book = new GoogleSpreadsheet(config.spreadsheet.book_id);
    await book.useServiceAccountAuth(creds);

    await book.loadInfo();
    const sheet = book.sheetsByIndex[0];
    const rows = await sheet.getRows();

    if (rows.length > 0) {
      let lastRecord = rows.reduce((pv, cv) => {
        if (parseInt(cv.Number) > parseInt(pv.Number)) {
          return cv;
        } else {
          return pv;
        }
      });
      this.setNumber(parseInt(lastRecord.Number) + 1);
    } else {
      this.setNumber(config.defaults.start_number);
    }
    this.setFilename(
      `${config.text.invoice[config.lang]} - ${this.recipient} - ${
        this.number
      } - ${moment(this.date).format("DD-MM-YYYY")}.pdf`
    );
    await sheet.addRow({
      Date: moment(this.date).format("DD/MM/YYYY"),
      Number: this.number,
      Recipient: this.recipient,
      Address: this.address,
      NIE: this.nie,
      Email: this.email,
      Items: JSON.stringify(this.items),
      Total: this.total,
    });
  }

  createPDF() {
    console.log("Creating PDF...");
    const doc = new PDFDocument();

    doc.pipe(fs.createWriteStream(this.filename));
    doc
      .fontSize(16 + config.style.font_size_offset)
      .text(config.myInfo.name)
      .fontSize(12 + config.style.font_size_offset)
      .text(config.myInfo.address1)
      .text(config.myInfo.address2)
      .text(`${config.myInfo.town} ${config.myInfo.postcode}`)
      .fontSize(10 + config.style.font_size_offset)
      .text(config.myInfo.nie)
      .fontSize(12 + config.style.font_size_offset)
      .moveDown()
      .font(config.style.font_bold)
      .fontSize(40 + config.style.font_size_offset)
      .text(config.text.invoice[config.lang])
      .fontSize(12 + config.style.font_size_offset)
      .font(config.style.font_bold)
      .text(config.text.date[config.lang])
      .font(config.style.font_normal)
      .text(moment(this.date).format("DD/MM/YYYY"))
      .moveDown()
      .font(config.style.font_bold)
      .text(config.text.invoice_number[config.lang])
      .font(config.style.font_normal)
      .text(this.number)
      .moveDown()
      .font(config.style.font_bold)
      .text(config.text.send_to[config.lang])
      .font(config.style.font_normal)
      .text(`${this.recipient} (`, { continued: true })
      .text(`${this.nie})`);

    //arrange the recipient address
    this.address.split(/\s?,\s?/g).map((i) => {
      doc.text(i);
    });
    doc
      .moveDown()
      .font(config.style.font_bold)
      .text(config.text.description[config.lang], { continued: true })
      .text(config.text.total[config.lang], { align: "right" })
      .image("./thinline.png", {
        width: doc.page.width - doc.page.margins.left * 2,
        height: 0.5,
        align: "center",
      })
      .moveDown()
      .font(config.style.font_normal);
    this.items.map((i) => {
      doc
        .text(i.description, { continued: true })
        .text(
          `${config.lang === "en" ? "£" : ""}${i.amount.toFixed(2)}${
            config.lang === "es" ? "€" : ""
          }`,
          { align: "right" }
        );
    });
    doc
      .moveDown()
      .image("./thinline.png", {
        width: doc.page.width - doc.page.margins.left * 2,
        height: 0.5,
        align: "center",
      })
      .moveDown()
      .font(config.style.font_bold)
      .fontSize(18 + config.style.font_size_offset)
      .text(
        `${config.text.grand_total[config.lang]}: ${
          config.lang === "en" ? "£" : ""
        }${this.total.toFixed(2)}${config.lang === "es" ? "€" : ""}`,
        { align: "right" }
      )
      .moveDown(4)
      .fontSize(12 + config.style.font_size_offset)
      .text(config.text.name_of_bank[config.lang])
      .font(config.style.font_normal)
      .text(config.myInfo.name_of_bank)
      .moveDown()
      .font(config.style.font_bold)
      .text(config.text.account_name[config.lang])
      .font(config.style.font_normal)
      .text(config.myInfo.account_name)
      .moveDown()
      .font(config.style.font_bold)
      .text(config.text.account_number[config.lang])
      .font(config.style.font_normal)
      .text(config.myInfo.account_number);
    doc.end();
    console.log("PDF created");
  }

  async uploadToGoogleDrive() {
    console.log("Uploading to Google Drive...");
    const googleDriveInstance = new NodeGoogleDrive({
      ROOT_FOLDER: config.drive_id,
    });
    await googleDriveInstance.useServiceAccountAuth(creds);

    await googleDriveInstance.create({
      source: fs.createReadStream(`./${this.filename}`),
      name: this.filename,
      mimeType: "application/pdf",
    });
    console.log("Uploaded to Google Drive.");
  }

  async sendToRecipient() {
    const sendRecipient = require("gmail-send")({
      user: config.myInfo.email,
      pass: require("./password.json").password,
      to: this.email,
      subject: `${config.text.invoice[config.lang]} - ${config.myInfo.name} - ${
        this.number
      }`,
    });
    await sendRecipient({
      files: `./${this.filename}`,
      html: config.messages.to_recipient,
    });
  }

  async sendToAccountant() {
    const sendAccountant = require("gmail-send")({
      user: config.myInfo.email,
      pass: require("./password.json").password,
      to: config.myInfo.accountant_email,
      subject: `${config.text.invoice[config.lang]} - ${config.myInfo.name} - ${
        this.number
      }`,
    });
    await sendAccountant({
      files: `./${this.filename}`,
      html: config.messages.to_accountant,
    });
  }

  cleanUp() {
    fs.unlinkSync(`./${this.filename}`);
  }
}
module.exports = Invoice;
