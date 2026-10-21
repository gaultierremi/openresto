import {
  fieldOfCode,
  infoErrors,
  infoFormFromState,
  infoRequest,
  parseRetention,
  type InfoForm,
} from "@/utils/onboardingInfo";
import { state } from "@/tests/helpers/onboardingFixtures";

const FILLED: InfoForm = {
  name: " Chez Paul ",
  address: "Rue Haute 1, 1000 Bruxelles",
  phone: "+32 2 123 45 67",
  email: "paul@chezpaul.be",
  legalName: "Chez Paul SRL",
  companyNumber: "0123.456.749",
  vatNumber: "",
  retention: "12",
};

describe("infoFormFromState", () => {
  it("turns missing values into empty fields and the retention into text", () => {
    const form = infoFormFromState(
      state({
        info: {
          name: "X",
          address: null,
          phoneNumber: null,
          emailAddress: null,
          legalName: null,
          companyNumber: null,
          vatNumber: null,
          bookingRetentionMonths: 6,
        },
      }).info
    );
    expect(form).toMatchObject({
      address: "",
      phone: "",
      email: "",
      vatNumber: "",
      retention: "6",
    });
  });
});

describe("parseRetention", () => {
  it("takes 1 and 60 and refuses 0 and 61", () => {
    expect(parseRetention("1")).toBe(1);
    expect(parseRetention("60")).toBe(60);
    expect(parseRetention("0")).toBeNull();
    expect(parseRetention("61")).toBeNull();
  });

  it("refuses text, a decimal and an empty field", () => {
    expect(parseRetention("")).toBeNull();
    expect(parseRetention("12.5")).toBeNull();
    expect(parseRetention("douze")).toBeNull();
    expect(parseRetention("-3")).toBeNull();
  });
});

describe("infoErrors", () => {
  it("has nothing to say about a filled form", () => {
    expect(infoErrors(FILLED)).toEqual({});
  });

  it("names every required field that is blank", () => {
    const errors = infoErrors({
      ...FILLED,
      name: " ",
      address: "",
      phone: "",
      email: "",
      legalName: "",
      companyNumber: "",
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["address", "companyNumber", "email", "legalName", "name", "phone"].sort()
    );
    expect(errors.email).toBe("errors.onboarding.email_required");
  });

  it("calls an address that is not one invalid rather than missing", () => {
    expect(infoErrors({ ...FILLED, email: "pas-un-mail" }).email).toBe(
      "errors.contact.email_invalid"
    );
  });

  it("leaves the VAT number optional", () => {
    expect(infoErrors({ ...FILLED, vatNumber: "" }).vatNumber).toBeUndefined();
  });

  it("refuses a retention outside 1 to 60", () => {
    expect(infoErrors({ ...FILLED, retention: "0" }).retention).toBe(
      "errors.onboarding.retention_invalid"
    );
    expect(infoErrors({ ...FILLED, retention: "61" }).retention).toBe(
      "errors.onboarding.retention_invalid"
    );
    expect(infoErrors({ ...FILLED, retention: "60" }).retention).toBeUndefined();
  });
});

describe("fieldOfCode", () => {
  it("names the field a code is about", () => {
    expect(fieldOfCode("onboarding.company_number_invalid")).toBe("companyNumber");
    expect(fieldOfCode("onboarding.vat_invalid")).toBe("vatNumber");
    expect(fieldOfCode("onboarding.phone_required")).toBe("phone");
    expect(fieldOfCode("onboarding.retention_invalid")).toBe("retention");
    expect(fieldOfCode("contact.email_invalid")).toBe("email");
  });

  it("names none for a code about the whole form, or no code", () => {
    expect(fieldOfCode("onboarding.suspended")).toBeNull();
    expect(fieldOfCode(undefined)).toBeNull();
  });
});

describe("infoRequest", () => {
  it("trims, and sends a blank VAT number as none", () => {
    expect(infoRequest(FILLED)).toEqual({
      name: "Chez Paul",
      address: "Rue Haute 1, 1000 Bruxelles",
      phoneNumber: "+32 2 123 45 67",
      emailAddress: "paul@chezpaul.be",
      legalName: "Chez Paul SRL",
      companyNumber: "0123.456.749",
      vatNumber: null,
      bookingRetentionMonths: 12,
    });
  });

  it("sends a VAT number that was typed", () => {
    expect(infoRequest({ ...FILLED, vatNumber: " BE0123.456.749 " }).vatNumber).toBe(
      "BE0123.456.749"
    );
  });
});
