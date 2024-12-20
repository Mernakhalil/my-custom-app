// Copyright (c) 2024, Merna and contributors
// For license information, please see license.txt

// Triggered when the item_code is selected/changed in the Sales Invoice Item table
frappe.ui.form.on("Sales Invoice Item", {
    item_code: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Ensure that the customer is selected before proceeding
        if (!frm.doc.customer) {
            frappe.throw(__("Please specify a customer before selecting an item."));
        }

        // If item_code is selected, fetch item details based on the customer and item code
        if (row.item_code) {
            frappe.call({
                method: "my_custom_app.my_custom_app.doctype.custom_sales_invoice.custom_sales_invoice.get_item_details", 
                args: {
                    customer: frm.doc.customer,
                    item_code: row.item_code
                },
                callback: function (response) {
                    console.log(response.message)
                    if (response.message) {
                        // Update fields in the child table with fetched item details
                        frappe.model.set_value(cdt, cdn, "rate", response.message.price_list_rate);
                        frappe.model.set_value(cdt, cdn, "base_rate", response.message.price_list_rate);
                        frappe.model.set_value(cdt, cdn, "price_list_rate", response.message.price_list_rate);
                        frappe.model.set_value(cdt, cdn, "uom", response.message.uom);
                        frappe.model.set_value(cdt, cdn, "stock_uom", response.message.uom);
                        frappe.model.set_value(cdt, cdn, "item_name", response.message.item_name);
                        frappe.model.set_value(cdt, cdn, "income_account", response.message.income_account);
                        frappe.model.set_value(cdt, cdn, "cost_center", response.message.cost_center);
                        frappe.model.set_value(cdt, cdn, "qty", 1);  // Default quantity is set to 1
                        frappe.model.set_value(cdt, cdn, "base_price_list_rate", response.message.price_list_rate);
                    }
                }
            });
        }
    }
});

// Triggered when UOM is changed in the Sales Invoice Item table
frappe.ui.form.on("Sales Invoice Item", {
    uom: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Ensure that the customer is selected before proceeding
        if (!frm.doc.customer) {
            frappe.throw(__("Please specify a customer before selecting an item."));
        }

        // If UOM is same as stock_uom, set conversion factor to 1
        if (row.uom === row.stock_uom) {
            frappe.model.set_value(cdt, cdn, "conversion_factor", 1);
        } else {
            // Fetch the conversion factor for the selected item and UOM
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Item UOM",
                    filters: {
                        parent: row.item_code,
                        uom: row.uom
                    }
                },
                callback: function (response) {
                    if (response.message) {
                        // If conversion factor exists, set it; otherwise, default to 1
                        let conversion_factor = response.message.conversion_factor || 1;
                        frappe.model.set_value(cdt, cdn, "conversion_factor", conversion_factor);
                    } else {
                        // If no conversion factor is found, set it to 1
                        frappe.model.set_value(cdt, cdn, "conversion_factor", 1);
                    }
                }
            });
        }
    }
});

// Triggered when quantity is changed in the Sales Invoice Item table
frappe.ui.form.on("Sales Invoice Item", {
    qty: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Ensure that the customer is selected before proceeding
        if (!frm.doc.customer) {
            frappe.throw(__("Please specify a customer before selecting an item."));
        }

        // If item_code and rate are available, calculate the amount based on qty and rate
        if (row.item_code && row.rate) {
            frappe.model.set_value(cdt, cdn, "amount", row.qty * row.rate);
            frappe.model.set_value(cdt, cdn, "base_amount", row.qty * row.rate);
        }
    }
});

// Triggered when rate is changed in the Sales Invoice Item table
frappe.ui.form.on("Sales Invoice Item", {
    rate: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Ensure that the customer is selected before proceeding
        if (!frm.doc.customer) {
            frappe.throw(__("Please specify a customer before selecting an item."));
        }

        // If item_code and rate are available, calculate the amount based on qty and rate
        if (row.item_code && row.rate) {
            frappe.model.set_value(cdt, cdn, "amount", row.qty * row.rate);
            frappe.model.set_value(cdt, cdn, "base_amount", row.qty * row.rate);
            frappe.model.set_value(cdt, cdn, "base_rate", row.rate);  // Update base rate
        }
    }
});

// Triggered when currency is changed in the Custom Sales Invoice form
frappe.ui.form.on("Custom Sales Invoice", {
    currency: function (frm) {
        // If a customer is specified, fetch the customer's default currency
        if (frm.doc.customer) {
            frappe.db.get_value("Customer", frm.doc.customer, "default_currency", function(r) {
                if (r && r.default_currency) {
                    // Log the customer's default currency
                    console.log("Customer's Default Currency: ", r.default_currency);
                    
                    // Fetch exchange rate between the selected currency and the customer's default currency
                    frappe.call({
                        method: "erpnext.setup.utils.get_exchange_rate",
                        args: {
                            transaction_date: frm.doc.posting_date,
                            from_currency: frm.doc.currency,
                            to_currency: r.default_currency
                        },
                        callback: function (response) {
                            if (response.message) {
                                frm.set_value("conversion_rate", response.message);  // Set conversion rate
                            }
                        }
                    });
                }
            });
        }
    }
});

// Triggered on form refresh for the Custom Sales Invoice
frappe.ui.form.on("Custom Sales Invoice", {
    refresh: function(frm) {
        // Update total rate when the form is refreshed
        update_total_rate(frm);
    }
});

// Triggered when rate or item_code is changed in the Sales Invoice Item table
frappe.ui.form.on("Sales Invoice Item", {
    rate: function(frm, cdt, cdn) {
        // Trigger total rate update when rate changes
        update_total_rate(frm);
    },
    item_code: function(frm, cdt, cdn) {
        // Trigger total rate update when item_code changes
        update_total_rate(frm);
    }
});

// Triggered when item_code is validated in the Sales Invoice Item table
frappe.ui.form.on("Sales Invoice Item", {
    validate: function(frm, cdt, cdn) {
        // Example: show a message on validate (you can replace this with any logic)
        frappe.msgprint("js validate");
    },
    item_code: function(frm, cdt, cdn) {
        // Trigger total rate update when item_code changes
        update_total_rate(frm);
    }
});

// Function to update the total rate (used in several places)
function update_total_rate(frm) {
    let total_rate = 0;
    
    // Loop through the child table items and sum the rates
    $.each(frm.doc.items || [], function(i, row) {
        total_rate += row.rate || 0;  // Accumulate rate
    });
    
    // Set the total rate in the form fields
    frm.set_value("base_net_total", total_rate);
    frm.set_value("base_grand_total", total_rate);
    frm.set_value("grand_total", total_rate);
}

// Trigger before submission to create payment entry
frappe.ui.form.on('Custom Sales Invoice', {
    before_submit: async function (frm) {
        // Create a promise to handle the dialog interaction
        let promise = new Promise((resolve, reject) => {
            const dialog = new frappe.ui.Dialog({
                title: 'Enter Mode of Payment',
                fields: [
                    {
                        label: 'Mode of Payment',
                        fieldname: 'mode_of_payment',
                        fieldtype: 'Link',
                        options: 'Mode of Payment',
                        reqd: 1
                    },
                    {
                        label: 'Amount',
                        fieldname: 'amount',
                        fieldtype: 'Currency',
                        default: frm.doc.grand_total,
                        read_only: 1
                    }
                ],
                primary_action_label: 'Submit Payment Entry',
                primary_action: function (data) {
                    // Call the server-side method to create the Payment Entry
                    frappe.call({
                        method: 'my_custom_app.my_custom_app.doctype.custom_sales_invoice.custom_sales_invoice.create_payment_entry',
                        args: {
                            sales_invoice: frm.doc.name,
                            mode_of_payment: data.mode_of_payment,
                            amount: data.amount
                        },
                        callback: function (r) {
                            if (!r.exc) {
                                if (r.message.error) {
                                    // Show the error message from the server
                                    frappe.msgprint(r.message.error);
                                    // Do not hide the dialog so the user can correct the data
                                    dialog.show();
                                    reject();
                                } else {
                                    // Payment Entry created successfully
                                    frappe.msgprint(__('Payment Entry created: ' + r.message.payment_entry_name));
                                    // Resolve the promise to allow invoice submission
                                    resolve();
                                    location.reload();
                                }
                            } else {
                                // Handle unexpected errors gracefully
                                frappe.throw(__('An unexpected error occurred.'));
                                reject();
                            }
                        }
                    });
                }
            });

            dialog.show(); // Show the payment dialog
        });

        // Wait for the promise to resolve
        await promise;
    },
});
