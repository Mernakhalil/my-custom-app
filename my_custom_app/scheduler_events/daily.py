
import frappe
from frappe import _
import requests
from datetime import datetime, timedelta

import logging
import time
import requests


import frappe
from frappe.utils import get_datetime
import logging

# Configure a logger
logger = logging.getLogger(__name__)

@frappe.whitelist()
def daily():
    try:
        # Get all customers
        customers = frappe.db.get_all("Customer", fields=["name"])

        if not customers:
            logger.info("No customers found to update.")
            return

        # Loop through them and update the price list for the 'Standard Selling'
        for customer in customers:
            try:
                frappe.db.set_value('Customer', customer.name, 'default_price_list', 'Standard Selling')
                frappe.db.commit()
                logger.info(f"Successfully updated default_price_list for customer: {customer.name}")
            except Exception as e:
                # Log error for the specific customer
                logger.error(f"Error updating default_price_list for customer {customer.name}: {str(e)}")
                continue  # Continue with the next customer if there is an error

    except Exception as e:
        # General error handling for the entire function
        logger.error(f"An error occurred while updating customers: {str(e)}")

    