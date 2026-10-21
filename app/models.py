from pydantic import BaseModel, Field


class EmailMessage(BaseModel):
    id: str
    subject: str = ""
    body: str = ""
    sender: str = ""


class ScoutRequest(BaseModel):
    emails: list[EmailMessage]


class LineItem(BaseModel):
    sku: str
    description: str = ""
    qty: float = 0
    unit_price: float = 0


class Document(BaseModel):
    """A PO or a vendor invoice, in structured form.

    PDF/text ingestion would produce exactly this shape; fixtures ship as
    JSON so the matcher stays deterministic and testable without an LLM.
    """

    doc_id: str
    line_items: list[LineItem] = Field(default_factory=list)
    freight: float = 0
    setup_fee: float = 0


class MatchRequest(BaseModel):
    po: Document
    invoice: Document


class ApprovalRequest(BaseModel):
    report_id: str
    decision: str  # "approved" | "rejected"
    approver: str = "ops-lead"
    note: str = ""
