// The building-rules agreement every tenant signs (garbage chute, gate keys,
// alterations to the apartment), in English and Arabic.
// Client-safe: the public signing page renders these clauses, and the PDF
// (pdf.tsx) prints the same ones side by side, so what the tenant reads is
// exactly what they sign.

export type AgreementLang = "en" | "ar";

/** Violation fees in OMR. Stored on each agreement when it is created. */
export const GARBAGE_VIOLATION_FEE = 10;
export const LOST_KEY_FEE = 7;
/** Gate keys handed to every tenant unless the lease says otherwise. */
export const DEFAULT_GATE_KEYS = 2;

/** OMR amounts are written with 3 decimals (baisa). */
export function formatOmr(amount: number, lang: AgreementLang): string {
  const n = Number(amount).toFixed(3);
  // Plain spaces: react-pdf mis-shapes Arabic around non-breaking spaces.
  return lang === "ar" ? `${n} ريال عماني` : `OMR ${n}`;
}

export interface AgreementTermsInput {
  gateKeys: number;
  garbageFee: number;
  keyFee: number;
}

export interface AgreementSection {
  heading: string;
  clauses: { number: string; text: string }[];
}

export interface AgreementCopy {
  title: string;
  intro: string;
  fields: {
    tenantName: string;
    nationalId: string;
    unit: string;
    leaseStart: string;
    gateKeys: string;
    reference: string;
  };
  sections: AgreementSection[];
  signature: string;
  date: string;
  signedElectronically: string;
}

export function agreementCopy(lang: AgreementLang, t: AgreementTermsInput): AgreementCopy {
  if (lang === "ar") {
    return {
      title: "اتفاقية قواعد المبنى للمستأجر",
      intro: "بالتوقيع أدناه، يوافق المستأجر على الالتزام بالقواعد التالية طوال مدة الإيجار:",
      fields: {
        tenantName: "اسم المستأجر",
        nationalId: "رقم الهوية / جواز السفر",
        unit: "المبنى / الوحدة",
        leaseStart: "تاريخ بدء الإيجار",
        gateKeys: "مفاتيح البوابة المسلّمة",
        reference: "رقم المرجع",
      },
      sections: [
        {
          heading: "أولاً: التخلص من النفايات ومجرى القمامة",
          clauses: [
            {
              number: "1.1",
              text: "يجب وضع جميع النفايات في أكياس ورميها داخل مجرى القمامة أو الحاوية المخصصة. لا يُسمح بترك النفايات خارج مجرى القمامة أو في الممرات أو الدرج أو المناطق المشتركة.",
            },
            {
              number: "1.2",
              text: `تُفرض رسوم قدرها ${formatOmr(t.garbageFee, "ar")} عن كل مخالفة، وتُضاف إلى حساب المستأجر.`,
            },
          ],
        },
        {
          heading: "ثانياً: مفاتيح البوابة",
          clauses: [
            {
              number: "2.1",
              text: `يستلم المستأجر عدد (${t.gateKeys}) من مفاتيح البوابة ويكون مسؤولاً عنها.`,
            },
            {
              number: "2.2",
              text: `تبلغ تكلفة كل مفتاح بديل أو إضافي ${formatOmr(t.keyFee, "ar")}، سواء كان المفتاح مفقوداً أو تالفاً أو مطلوباً.`,
            },
            {
              number: "2.3",
              text: "يجب إعادة جميع المفاتيح المسلّمة عند الإخلاء، ويُحتسب كل مفتاح غير مُعاد بنفس السعر.",
            },
          ],
        },
        {
          heading: "ثالثاً: التعديلات على الشقة",
          clauses: [
            {
              number: "3.1",
              text: "لا يجوز عمل أي ثقوب أو إجراء أي تعديلات على جدران الشقة أو أرضياتها أو أسقفها أو تجهيزاتها أو هيكلها دون الحصول على موافقة مسبقة من إدارة المبنى.",
            },
            {
              number: "3.2",
              text: "تقوم إدارة المبنى بإصلاح أي ثقب أو تعديل غير معتمد وإعادته إلى حالته الأصلية على نفقة المستأجر، وتُضاف التكلفة إلى حساب المستأجر.",
            },
          ],
        },
        {
          heading: "رابعاً: أحكام عامة",
          clauses: [
            {
              number: "4.1",
              text: "تُضاف الرسوم المترتبة بموجب هذه الاتفاقية إلى حساب المستأجر وتُستحق مع فاتورة الإيجار التالية.",
            },
            {
              number: "4.2",
              text: "هذه الاتفاقية مكمّلة لعقد الإيجار ولا تحل محل أي من بنوده.",
            },
          ],
        },
      ],
      signature: "توقيع المستأجر",
      date: "التاريخ",
      signedElectronically: "تم التوقيع إلكترونياً",
    };
  }
  return {
    title: "Tenant Building Rules Agreement",
    intro: "By signing below, the tenant agrees to the following rules for the duration of their tenancy:",
    fields: {
      tenantName: "Tenant name",
      nationalId: "ID / Passport no.",
      unit: "Building / Unit",
      leaseStart: "Lease start date",
      gateKeys: "Gate keys issued",
      reference: "Reference",
    },
    sections: [
      {
        heading: "1. Waste disposal and the garbage chute",
        clauses: [
          {
            number: "1.1",
            text: "All garbage must be bagged and placed inside the garbage chute or the designated bin. Leaving garbage outside the chute, in corridors, stairwells or common areas is not permitted.",
          },
          {
            number: "1.2",
            text: `Each violation carries a fee of ${formatOmr(t.garbageFee, "en")}, added to the tenant's account.`,
          },
        ],
      },
      {
        heading: "2. Gate keys",
        clauses: [
          {
            number: "2.1",
            text: `The tenant receives ${t.gateKeys} gate key${t.gateKeys === 1 ? "" : "s"} and is responsible for them.`,
          },
          {
            number: "2.2",
            text: `Each replacement or extra key, whether lost, damaged or requested, costs ${formatOmr(t.keyFee, "en")}.`,
          },
          {
            number: "2.3",
            text: "All issued keys must be returned at move-out. Unreturned keys are charged at the same rate.",
          },
        ],
      },
      {
        heading: "3. Alterations to the apartment",
        clauses: [
          {
            number: "3.1",
            text: "No holes may be drilled and no alterations made to the walls, floors, ceilings, fixtures or structure of the apartment without prior approval from building management.",
          },
          {
            number: "3.2",
            text: "Any unapproved hole or alteration will be repaired and restored by building management at the tenant's cost, charged to the tenant's account.",
          },
        ],
      },
      {
        heading: "4. General",
        clauses: [
          {
            number: "4.1",
            text: "Fees under this agreement are added to the tenant's account and are payable with the next rent invoice.",
          },
          {
            number: "4.2",
            text: "This agreement is in addition to the lease and does not replace any of its terms.",
          },
        ],
      },
    ],
    signature: "Tenant signature",
    date: "Date",
    signedElectronically: "Signed electronically",
  };
}
