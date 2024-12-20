// Trigger when the item code is selected or changed in the Sales Invoice Item row
frappe.ui.form.on("Sales Invoice Item", {
    item_code: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Ensure a customer is specified before selecting an item
        if (!frm.doc.customer) {
            frappe.throw(__("Please specify a customer before selecting an item."));
        }

        if (row.item_code) {
            // Fetch item details based on customer and item code
            frappe.call({
                method: "my_custom_app.my_custom_app.doctype.custom_sales_invoice.custom_sales_invoice.get_item_details", 
                args: {
                    customer: frm.doc.customer,
                    item_code: row.item_code
                },
                callback: function (response) {
                    if (response.message) {
                        // Update the fields in the child table with the fetched item details
                        frappe.model.set_value(cdt, cdn, "rate", response.message.price_list_rate);
                        frappe.model.set_value(cdt, cdn, "base_rate", response.message.price_list_rate);
                        frappe.model.set_value(cdt, cdn, "price_list_rate", response.message.price_list_rate);
                        frappe.model.set_value(cdt, cdn, "uom", response.message.uom);
                        frappe.model.set_value(cdt, cdn, "stock_uom", response.message.uom);
                        frappe.model.set_value(cdt, cdn, "item_name", response.message.item_name);
                        frappe.model.set_value(cdt, cdn, "income_account", response.message.income_account);
                        frappe.model.set_value(cdt, cdn, "cost_center", response.message.cost_center);
                        frappe.model.set_value(cdt, cdn, "qty", 1); // Set default quantity to 1
                        frappe.model.set_value(cdt, cdn, "base_price_list_rate", response.message.price_list_rate); // Set base price rate
                    }
                }
            });
        }
    }
});

// Trigger when the UOM (Unit of Measure) is changed in the Sales Invoice Item row
frappe.ui.form.on("Sales Invoice Item", {
    uom: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Ensure a customer is specified before selecting an item
        if (!frm.doc.customer) {
            frappe.throw(__("Please specify a customer before selecting an item."));
        }

        if (row.item_code) {
            // If UOM is the same as stock_uom, set conversion factor to 1
            if (row.uom === row.stock_uom) {
                frappe.model.set_value(cdt, cdn, "conversion_factor", 1);
            } else {
                // Fetch the conversion factor for the item
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
                            // If conversion factor exists, set it; otherwise, set to 1
                            let conversion_factor = response.message.conversion_factor || 1;
                            frappe.model.set_value(cdt, cdn, "conversion_factor", conversion_factor);
                        } else {
                            // Set conversion factor to 1 if not found
                            frappe.model.set_value(cdt, cdn, "conversion_factor", 1);
                        }
                    }
                });
            }
        }
    }
});

// Trigger when quantity is changed in the Sales Invoice Item row
frappe.ui.form.on("Sales Invoice Item", {
    qty: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Ensure a customer is specified before selecting an item
        if (!frm.doc.customer) {
            frappe.throw(__("Please specify a customer before selecting an item."));
        }

        if (row.item_code && row.rate) {
            // Recalculate the amount based on qty and rate
            frappe.model.set_value(cdt, cdn, "amount", row.qty * row.rate);
            frappe.model.set_value(cdt, cdn, "base_amount", row.qty * row.rate);
        }
    }
});

// Trigger when rate is changed in the Sales Invoice Item row
frappe.ui.form.on("Sales Invoice Item", {
    rate: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Ensure a customer is specified before selecting an item
        if (!frm.doc.customer) {
            frappe.throw(__("Please specify a customer before selecting an item."));
        }

        if (row.item_code && row.rate) {
            // Recalculate the amount based on qty and rate
            frappe.model.set_value(cdt, cdn, "amount", row.qty * row.rate);
            frappe.model.set_value(cdt, cdn, "base_amount", row.qty * row.rate);
            frappe.model.set_value(cdt, cdn, "base_rate", row.rate); // Set base rate
        }
    }
});

// Trigger when the currency field in the Sales Invoice is changed
frappe.ui.form.on("Custom Sales Invoice", {
    currency: function (frm) {
        if (frm.doc.customer) {
            // Fetch the default currency of the customer
            frappe.db.get_value("Customer", frm.doc.customer, "default_currency", function(r) {
                if (r && r.default_currency) {
                    // Fetch exchange rate based on transaction date and currencies
                    frappe.call({
                        method: "erpnext.setup.utils.get_exchange_rate",
                        args: {
                            transaction_date: frm.doc.posting_date,
                            from_currency: frm.doc.currency,
                            to_currency: r.default_currency
                        },
                        callback: function (response) {
                            if (response.message) {
                                frm.set_value("conversion_rate", response.message); // Set the conversion rate
                            }
                        }
                    });
                }
            });
        }
    }
});

// Trigger when the form is loaded or refreshed to update the total rate
frappe.ui.form.on("Custom Sales Invoice", {
    refresh: function(frm) {
        update_total_rate(frm);
    }
});

// Trigger when rate or item_code is changed in Sales Invoice Item
frappe.ui.form.on("Sales Invoice Item", {
    rate: function(frm, cdt, cdn) {
        update_total_rate(frm);
    },
    item_code: function(frm, cdt, cdn) {
        update_total_rate(frm);
    }
});

// Function to update the total rate (grand total)
function update_total_rate(frm) {
    let total_rate = 0;
    
    // Loop through the child table items and sum the rates
    $.each(frm.doc.items || [], function(i, row) {
        total_rate += row.rate || 0; // Sum up the rates
    });
    
    // Set the total rate to the form's fields
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
                    dialog.hide();

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
                                    dialog.show(); // Show the dialog again to allow user to correct
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

        // Submit the invoice after payment entry is created and promise resolves
        frm.submit();
    },

    on_submit: function (frm) {
        frappe.msgprint(__('Sales Invoice successfully submitted.'));
    }
});
