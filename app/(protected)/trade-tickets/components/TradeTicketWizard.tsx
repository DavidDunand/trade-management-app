"use client";

import { useState } from "react";
import Stepper from "./Stepper";
import Step1Search from "./steps/Step1Search";
import Step2LegPreview from "./steps/Step2LegPreview";
import Step3Validation from "./steps/Step3Validation";
import Step4Contact from "./steps/Step4Contact";
import Step5Preview from "./steps/Step5Preview";
import Step6Export from "./steps/Step6Export";
import type { TradeLeg, ClientContact, WizardStep, AppUser } from "../types";

interface Props {
  currentUser: AppUser;
}

export default function TradeTicketWizard({ currentUser }: Props) {
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedLeg, setSelectedLeg] = useState<TradeLeg | null>(null);
  const [selectedContact, setSelectedContact] = useState<ClientContact | null>(null);
  const [custodianContact, setCustodianContact] = useState<ClientContact | null>(null);

  // Track the highest reached step so the stepper can show correct completed state
  const [maxStep, setMaxStep] = useState<WizardStep>(1);

  function advance(next: WizardStep) {
    setStep(next);
    if (next > maxStep) setMaxStep(next);
  }

  function reset() {
    setStep(1);
    setMaxStep(1);
    setSelectedLeg(null);
    setSelectedContact(null);
    setCustodianContact(null);
  }

  // Determine which steps to skip based on contact count
  // Step 4 is skipped when the client has exactly one contact
  // (the wizard manages this: Step3 → onNext checks contact count)
  const [skipStep4, setSkipStep4] = useState(false);

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-3xl">
        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Stepper header */}
          <div className="px-8 py-6 border-b border-gray-100">
            <Stepper current={step} maxReached={maxStep} />
          </div>

          {/* Step content */}
          <div className="px-8 py-6 min-h-[420px]">
            {step === 1 && (
              <Step1Search
                onSelectLeg={(leg) => {
                  setSelectedLeg(leg);
                  advance(2);
                }}
              />
            )}

            {step === 2 && selectedLeg && (
              <Step2LegPreview
                leg={selectedLeg}
                onBack={() => setStep(1)}
                onConfirm={() => advance(3)}
              />
            )}

            {step === 3 && selectedLeg && (
              <Step3Validation
                leg={selectedLeg}
                onBack={() => setStep(2)}
                onNext={() => advance(4)}
              />
            )}

            {step === 4 && selectedLeg && (
              <Step4Contact
                leg={selectedLeg}
                initialContact={selectedContact}
                initialCustodianContact={custodianContact}
                onBack={() => setStep(3)}
                onNext={(contact, cpContact) => {
                  setSelectedContact(contact);
                  setCustodianContact(cpContact);
                  advance(5);
                }}
              />
            )}

            {step === 5 && selectedLeg && selectedContact && (
              <Step5Preview
                leg={selectedLeg}
                contact={selectedContact}
                custodianContact={custodianContact}
                user={currentUser}
                onBack={() => setStep(4)}
                onNext={() => advance(6)}
              />
            )}

            {step === 6 && selectedLeg && selectedContact && (
              <Step6Export
                leg={selectedLeg}
                contact={selectedContact}
                custodianContact={custodianContact}
                user={currentUser}
                onBack={() => setStep(5)}
                onReset={reset}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
