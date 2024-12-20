import frappe
from frappe.model.document import Document
from frappe import _

class CustomSalesInvoice(Document):
    def validate(self):
        # Fetch debit-to account from the Customer's Party Account
        debit_to_acc = frappe.db.get_value(
            "Party Account", 
            {"parent": self.customer, "company": self.company}, 
            "account"
        )
        
        # If no account found for the customer, fetch from the Customer Group's Party Account
        if not debit_to_acc:
            customer_group = frappe.db.get_value("Customer", {"name": self.customer}, "customer_group")
            debit_to_acc = frappe.db.get_value(
                "Party Account", 
                {"parent": customer_group, "company": self.company}, 
                "account"
            )
        
        # If still not found, fetch the default receivable account from the Company
        if not debit_to_acc:
            debit_to_acc = frappe.db.get_value(
                "Company", 
                {"name": self.company}, 
                "default_receivable_account"
            )
        
        # Throw an error if no account is found
        if not debit_to_acc:
            frappe.throw(f"No receivable account found for customer {self.customer}.")

        # Set the account for the invoice
        self.debit_to_account = debit_to_acc

    def on_submit(self):
        # Create the GL entries for the Sales Invoice
        for item in self.items:
            income_account = item.income_account
            if not income_account:
                income_account = self.company.default_income_account

            # Debit the receivable account (Sales Invoice)
            frappe.get_doc({
                "doctype": "GL Entry",
                "posting_date": self.posting_date,
                "debit": item.amount,
                "debit_in_account_currency": item.amount,
                "account": self.debit_to_account,
                "party_type": "Customer",
                "party": self.customer,
                "voucher_type": "Custom Sales Invoice",
                "voucher_no": self.name,
            }).insert()

            # Credit the income account for each item
            frappe.get_doc({
                "doctype": "GL Entry",
                "posting_date": self.posting_date,
                "credit": item.amount,
                "credit_in_account_currency": item.amount,
                "account": income_account,
                "party_type": "Customer",
                "party": self.customer,
                "voucher_type": "Custom Sales Invoice",
                "voucher_no": self.name,
            }).insert()

    # Function to create a Payment Entry after submitting the invoice
@frappe.whitelist()
def create_payment_entry(sales_invoice, mode_of_payment, amount):
    # Fetch the sales invoice document
    sales_invoice_doc = frappe.get_doc("Custom Sales Invoice", sales_invoice)
    
    # Get the account for the mode of payment, handle case when no account is found
    pad_to_acc = frappe.db.get_value("Mode of Payment Account", {"parent": mode_of_payment, "company": sales_invoice_doc.company}, "default_account")
    
    # If no account is found, throw a user-friendly error
    if not pad_to_acc:
        frappe.throw(_("No default account found for mode of payment '{0}'. Please configure a default account for this mode of payment or select a different one.").format(mode_of_payment))
    
    # Ensure amount is a numeric value
    try:
        amount = float(amount)  # Convert to float if it's a string
    except ValueError:
        frappe.throw(_("Invalid amount value: {0}").format(amount))
    
    # Create the Payment Entry document
    payment_entry = frappe.get_doc({
        "doctype": "Payment Entry",
        "payment_type": "Receive",
        "party_type": "Customer",
        "party": sales_invoice_doc.customer,
        "company": sales_invoice_doc.company,
        "paid_amount": amount,
        "received_amount": amount,
        "reference_no": sales_invoice,
        "reference_date": sales_invoice_doc.posting_date,
        "mode_of_payment": mode_of_payment,
        "target_exchange_rate": 1,
        "paid_to_account_currency": sales_invoice_doc.currency,
        "paid_to": pad_to_acc,
        "custom_against_doctype": sales_invoice_doc.doctype,
        "custom_against_name": sales_invoice
    })

    # Insert and submit the Payment Entry, handle potential errors
    try:
        payment_entry.insert()
        payment_entry.submit()
        sales_invoice_doc.submit()
    except Exception as e:
        frappe.throw(_("Error while creating payment entry: {0}").format(str(e)))

    # Update the Sales Invoice status to 'Paid' if the invoice is fully paid
    if amount >= sales_invoice_doc.grand_total:
        sales_invoice_doc.status = "Paid"
        sales_invoice_doc.save()

    return payment_entry.name

# Function to get item details based on customer and item code
@frappe.whitelist()
def get_item_details(customer,item_code):
    # Fetch the Item document
    item = frappe.get_doc("Item", item_code)
    
    # Fetch Item Default details
    item_defaults = item.get("item_defaults", [{}])[0] if item.item_defaults else {}
    
    # Fetch price list rate
    price_list = frappe.db.get_value("Customer", {"name": customer}, "default_price_list")
    price_list_rate = frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": price_list}, "price_list_rate")
    
    return {
        "item_name": item.item_name,
        "uom": item.stock_uom,
        "price_list_rate": price_list_rate,
        "income_account": item_defaults.get("income_account"),
        "cost_center": item_defaults.get("selling_cost_center")
    }
