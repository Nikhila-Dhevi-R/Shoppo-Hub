let products = JSON.parse(localStorage.getItem("products")) || [];

const table = document.getElementById("productTable");

function displayProducts(data){

table.innerHTML="";

data.forEach((product,index)=>{

table.innerHTML += `

<tr>

<td>${index+1}</td>

<td>${product.name}</td>

<td>₹${product.price}</td>

<td>${product.category}</td>

<td>

<button
class="delete"
onclick="deleteProduct(${index})">

Delete

</button>

</td>

</tr>

`;

});

}

displayProducts(products);

// Add Product

document.getElementById("addProduct").onclick=function(){

const name=document.getElementById("productName").value.trim();

const price=document.getElementById("productPrice").value;

const category=document.getElementById("productCategory").value.trim();

if(!name || !price || !category){

alert("Fill all fields");

return;

}

products.push({

name,

price,

category

});

localStorage.setItem(

"products",

JSON.stringify(products)

);

displayProducts(products);

document.getElementById("productName").value="";
document.getElementById("productPrice").value="";
document.getElementById("productCategory").value="";

}

// Delete

function deleteProduct(index){

products.splice(index,1);

localStorage.setItem(

"products",

JSON.stringify(products)

);

displayProducts(products);

}

// Search

document.getElementById("search")

.addEventListener("keyup",function(){

const keyword=this.value.toLowerCase();

const filtered=products.filter(p=>

p.name.toLowerCase().includes(keyword)

);

displayProducts(filtered);

});